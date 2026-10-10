import { validProviderFile } from "@/lib/portals/provider-file";
import {registerScan,securityRpc,scannedDownload} from '@/lib/documents/security';
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/agents/persistence";
import {
  checked,
  portalFailure,
  portalSession,
  portalResponse,
  PortalError,
} from "@/lib/portals/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const { db, context } = await portalSession(request);
    if (Number(request.headers.get("content-length") ?? 0) > 3300000)
      throw new PortalError(413, "Upload a PDF, JPG or PNG up to 3 MB.");
    const form = await request.formData();
    const org = z.uuid().parse(form.get("organizationId"));
    const allowed =
      context.role === "admin" ||
      context.role === "super_admin" ||
      context.organizations.some(
        (item) => item.id === org && item.status === "active",
      );
    if (!allowed)
      throw new PortalError(
        403,
        "You cannot upload documents for this organization.",
      );
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 1 || file.size > 3145728)
      throw new PortalError(400, "Upload a PDF, JPG or PNG up to 3 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validProviderFile(bytes, file.type))
      throw new PortalError(
        400,
        "The file content must match its PDF, JPG or PNG type.",
      );
    const documentType = z
      .enum([
        "license",
        "accreditation",
        "certificate",
        "package",
        "official_information",
        "supporting_evidence",
        "profile_image",
      ])
      .parse(form.get("documentType"));
    const recordId = form.get("recordId")
      ? z.uuid().parse(form.get("recordId"))
      : undefined;
    if (recordId)
      checked(
        await db
          .from("provider_records")
          .select("id")
          .eq("id", recordId)
          .eq("organization_id", org)
          .single(),
      );
    const id = randomUUID();
    const path = `${org}/${id}`;
    const admin=createAdminClient();
    const job=await registerScan(admin,'provider-documents',path,bytes,file.type,file.name);
    const storage = admin.storage.from("provider-documents");
    const uploaded = await storage.upload(path, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (uploaded.error)
      throw new PortalError(
        400,
        "We couldn't upload this file. Please try again.",
      );
    const result = await db.rpc("portal_command", {
      p_action: "register_document",
      p_input: {
        organizationId: org,
        documentId: id,
        recordId,
        name: file.name.slice(0, 180),
        documentType,
        storagePath: path,
        mimeType: file.type,
        sizeBytes: file.size,
        expiresOn: String(form.get("expiresOn") ?? ""),
      },
    });
    if (result.error) {
      await storage.remove([path]);
      checked(result);
    }
    await securityRpc(admin,'document_security_ready',{p_id:job.id});
    return portalResponse({...Object(result.data),securityStatus:job.state,notice:'Upload saved privately. Download requires successful security checks.'});
  } catch (error) {
    return portalFailure(error);
  }
}
export async function GET(request: NextRequest) {
  try {
    const { db } = await portalSession(request);
    const id = z.uuid().parse(request.nextUrl.searchParams.get("id"));
    const result = await db
      .from("provider_documents")
      .select("*")
      .eq("id", id)
      .single();
    const doc = checked(
      result,
    ) as import("@/types/database").Database["public"]["Tables"]["provider_documents"]["Row"];
    if (doc.status === "archived")
      throw new PortalError(404, "This document is archived.");
    const bytes=await scannedDownload(createAdminClient(),'provider-documents',doc.storage_path);
    const filename = doc.name.replaceAll(/[\r\n"\\]/g, "_");
    return new Response(bytes, {
      headers: {
        "Content-Type": doc.mime_type,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return portalFailure(error);
  }
}
