import "server-only";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { createUserClient, verifyUser } from "@/lib/agents/persistence";
import { portalAllowed, portalSchema, type PortalContext } from "./config";

export class PortalError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}
const messages: Record<string, string> = {
  OPERATIONS_RETRY_WAIT: 'Wait until the next eligible check and refresh before reconciling again.',
  PORTAL_ORGANIZATION_UNVERIFIED: "Current organization authority approval is required for operational access and first-party publication.",
  PORTAL_CONTACT_CONFIRMATION_REQUIRED: "Record the actual official-contact confirmation before approving organization authority.",
  PORTAL_OWNERSHIP_CONFLICT: "Another organization owns this canonical listing. Admin must resolve and audit the existing claim first.",
  PORTAL_OWNERSHIP_SCOPE: "Choose a listing and draft within this organization’s reviewed authority scope.",
  PORTAL_CONFIRMATION_REQUIRED: 'Review and explicitly confirm this action before saving it.',
  INQUIRY_INPUT_INVALID: 'Check the request fields and try again.',
  INQUIRY_RETRY_CONFLICT: 'This retry contains different information. Review and submit a new operation.',
  INQUIRY_ENTITY_UNAVAILABLE: 'This listing is no longer available for assistance.',
  INQUIRY_PROVIDER_UNAVAILABLE: 'This listing has no connected provider team. Support coordination remains available.',
  INQUIRY_RESOLUTION_REQUIRED: 'Describe the resolution before closing this request.',
  INQUIRY_DOCUMENT_LIMIT: 'This request has reached its file history limit.',
  INQUIRY_FILE_NOT_STORED: 'The file was not stored. Retry your upload.',
  PORTAL_REFERENCE_SOURCE_REQUIRED: "Choose a public HTTPS source, source category and actual collection time for this claim.",
  PORTAL_PACKAGE_EVIDENCE_REQUIRED: "Review each provided package field against its relevant source or approved supporting document before approving or publishing.",
  PORTAL_PACKAGE_CONDITIONS_REQUIRED: "Describe the limits or extra charges for every conditional package service.",
  PORTAL_REFERENCE_CLAIMS_REQUIRED: "Attach supporting sources to every populated field before submission. Reviews must use the attached source URL.",
  PORTAL_REFERENCE_REVIEW_REQUIRED: "Review every sourced field and resolve missing, stale or conflicting evidence before approval or publication.",
  PORTAL_REFERENCE_LOCATION_REQUIRED: "Choose the exact sourced location for this offering. Other branches do not inherit its availability.",
  PORTAL_REFERENCE_INDEPENDENT_EVIDENCE: "Accreditation verification requires independent issuer, regulator or government evidence.",
  PORTAL_SECTIONS_UNRESOLVED:
    "An administrator must approve every frozen section, with accepted current evidence, before approving or publishing this submission.",
  PORTAL_CONFLICT:
    "This record changed since you opened it. Reload before saving.",
  PORTAL_DENIED: "You do not have access to this operation.",
  PORTAL_RECORD_LOCKED:
    "This revision is under review. Wait for a review decision before editing.",
  PORTAL_PROFILE_REQUIRED:
    "Complete the required organization profile fields before submitting.",
  PORTAL_PACKAGE_REQUIRED:
    "Choose a published treatment and add a description. Provide the documented price and currency, or select contact-provider or unpublished pricing. Duration may remain empty.",
  PORTAL_EVIDENCE_REQUIRED:
    "Approved, current evidence is required for this action.",
  PORTAL_PUBLIC_REFERENCE_REQUIRED:
    "An administrator must source, review and publish the selected location, specialty and treatment in the reference catalog before this provider can be published.",
  PORTAL_EVIDENCE_EXPIRED:
    "This evidence has expired. Upload current evidence.",
  PORTAL_REVIEW_UNRESOLVED:
    "Resolve conflicting, rejected or stale field reviews before publishing.",
  PORTAL_LAST_ADMIN: "Keep at least one active administrator.",
  PORTAL_NOTHING_TO_SUBMIT: "There are no draft changes to submit.",
  PORTAL_CONSENT_REQUIRED: "Patient consent is required for this action.",
  PORTAL_TRANSITION_INVALID:
    "This action is unavailable in the current status.",
  PORTAL_REVIEW_REASON_REQUIRED:
    "Add a clear reason for the review decision or escalation.",
  PORTAL_SYNTHETIC_NOT_VERIFIABLE:
    "Synthetic content cannot be marked as verified.",
  PORTAL_REFERENCED_CONTENT:
    "Published records still reference this content. Update those records first.",
  PORTAL_USE_PROVIDER_WORKFLOW:
    "Manage this provider listing through its reviewed submission workflow.",
  PORTAL_INVITE_INVALID:
    "This invitation is unavailable, expired, or belongs to a different email address.",
};
export function checked<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error || result.data === null) {
    const code = Object.keys(messages).find((key) =>
      result.error?.message.includes(key),
    );
    throw new PortalError(
      code === "PORTAL_DENIED" ? 403 : 400,
      code
        ? messages[code]
        : "We couldn't save or load this change. Please try again.",
    );
  }
  return result.data as NonNullable<T>;
}
export async function portalSession(request: NextRequest) {
  const portal = portalSchema.parse(
    request.nextUrl.searchParams.get("portal") ?? "patient",
  );
  const token = /^Bearer (.+)$/.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];
  if (!token) throw new PortalError(401, "Sign in to continue.");
  let user;
  try {
    user = await verifyUser(token);
  } catch {
    throw new PortalError(401, "Sign in to continue.");
  }
  const db = createUserClient(token);
  const context = checked(
    await db.rpc("portal_context", {}),
  ) as unknown as PortalContext;
  if (!portalAllowed(portal, context.role))
    throw new PortalError(403, "This portal requires an assigned staff role.");
  return {
    portal,
    token,
    user,
    db,
    context: { ...context, email: user.email },
  };
}
export function portalResponse(data: unknown) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export function portalFailure(error: unknown) {
  if (error instanceof PortalError)
    return NextResponse.json(
      { error: error.publicMessage },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  return NextResponse.json(
    {
      error:
        error instanceof z.ZodError
          ? "Check the form fields and try again."
          : "We couldn't complete this request. Please try again.",
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
