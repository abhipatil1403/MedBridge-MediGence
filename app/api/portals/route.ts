import { NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { getPublicSupabaseClient } from "@/lib/supabase/server";
import { networkActions, networkCommandSchema } from "@/lib/portals/network";
import { recordInputSchema } from "@/lib/portals/config";
import { referenceOrganizationSchema, referenceSourceSchema, referenceClaimSchema, referenceReviewSchema } from "@/lib/portals/reference";
import {
  checked,
  portalFailure,
  portalResponse,
  portalSession,
  PortalError,
} from "@/lib/portals/server";

import { operationsActions, operationsCommandSchema } from '@/lib/operations/contracts';
import { recordHealth } from '@/lib/operations/server';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const resources = {
  organization_verification_requests: { search: "legal_name", sort: "submitted_at" },
  provider_listing_ownership: { search: null, sort: "assigned_at" },
  organizations: { search: "name", sort: "updated_at" },
  provider_records: { search: "name", sort: "updated_at" },
  provider_revisions: { search: "name", sort: "created_at" },
  provider_submissions: { search: "message", sort: "submitted_at" },
  provider_submission_items: { search: null, sort: "revision" },
  provider_documents: { search: "name", sort: "created_at" },
  provider_field_reviews: { search: "field", sort: "sequence" },
  provider_section_reviews: { search: "comment", sort: "sequence" },
  organization_members: { search: null, sort: "last_active_at" },
  organization_invites: { search: "email", sort: "created_at" },
  organization_messages: { search: "body", sort: "created_at" },
  portal_verification_checks: { search: null, sort: "created_at" },
  portal_notifications: { search: "title", sort: "created_at" },
  audit_events: { search: "event_name", sort: "occurred_at" },
  support_cases: { search: "title", sort: "updated_at" },
  support_case_messages: { search: "body", sort: "created_at" },
  support_tasks: { search: "title", sort: "updated_at" },
  portal_accounts: { search: null, sort: "updated_at" },
  portal_settings: { search: "key", sort: "updated_at" },
  catalog_drafts: { search: "name", sort: "updated_at" },
  source_records: { search: "source_name", sort: "created_at" },
  provider_reference_claims: { search: "field", sort: "created_at" },
  hospitals: { search: "name", sort: "updated_at" },
  doctors: { search: "name", sort: "updated_at" },
  packages: { search: "name", sort: "updated_at" },
  treatments: { search: "name", sort: "name" },
  specialties: { search: "name", sort: "name" },
  countries: { search: "name", sort: "name" },
  cities: { search: "name", sort: "name" },
  healthcare_services: { search: "name", sort: "name" },
  conversations: { search: "title", sort: "updated_at" },
  document_workspaces: { search: null, sort: "updated_at" },
  cases: { search: "title", sort: "updated_at" },
} satisfies Partial<
  Record<
    keyof Database["public"]["Tables"],
    { search: string | null; sort: string }
  >
>;
const orgTables = new Set([
  "organization_verification_requests",
  "provider_listing_ownership",
  "provider_reference_claims",
  "provider_records",
  "provider_revisions",
  "provider_submissions",
  "provider_documents",
  "provider_field_reviews",
  "provider_section_reviews",
  "organization_members",
  "organization_invites",
  "organization_messages",
  "portal_verification_checks",
  "audit_events",
]);
const adminOnly = new Set([
  "provider_reference_claims",
  "portal_settings",
  "catalog_drafts",
  "source_records",
]);
function directoryPage(
  data: Record<string, unknown>[],
  params: URLSearchParams,
) {
  const search = (params.get("q") ?? "").toLowerCase().slice(0, 100);
  const requested = params.get("sort") ?? "name";
  const sort = ["name", "email", "role", "last_active_at"].includes(requested)
    ? requested
    : "name";
  const direction = params.get("direction") === "asc" ? 1 : -1;
  const rows = data
    .filter(
      (row) =>
        !search ||
        [row.name, row.email, row.role].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(search),
        ),
    )
    .sort(
      (a, b) =>
        direction *
        String(a[sort] ?? a.email ?? "").localeCompare(
          String(b[sort] ?? b.email ?? ""),
        ),
    );
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(params.get("page") ?? 1);
  const size = z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .parse(params.get("size") ?? 20);
  return {
    rows: rows.slice((page - 1) * size, page * size),
    total: rows.length,
    page,
    size,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { db, context, portal } = await portalSession(request);
    // This read adapter uses a fixed table/column allowlist below; mutations stay typed RPCs.
    const readDb = db as SupabaseClient;
    const params = request.nextUrl.searchParams;
    const resource = params.get("resource") ?? "context";
    if (resource === "context") {
      checked({ ...(await db.rpc("portal_touch_activity", {})), data: true });
      return portalResponse(context);
    }
    if (resource === 'operations_overview') return portalResponse(checked(await db.rpc('operations_overview', {}).abortSignal(AbortSignal.timeout(5000))));
    if (resource === 'operations_inquiries') return portalResponse(checked(await db.rpc('operations_inquiries', {p_filter: z.enum(['all','overdue','unassigned','support','provider','patient']).parse(params.get('filter') ?? 'overdue')}).abortSignal(AbortSignal.timeout(5000))));
    if (resource === "stats") {
      const org = params.get("organizationId");
      const counters =
        portal === "provider"
          ? [
              ["Published records", "provider_records", "published"],
              ["Draft records", "provider_records", "draft"],
              ["Submitted records", "provider_records", "submitted"],
              ["Change requests", "provider_records", "changes_requested"],
              ["Documents", "provider_documents", ""],
              ["Unread notifications", "portal_notifications", ""],
            ]
          : [
              ["Open cases", "support_cases", "open"],
              ["In progress", "support_cases", "in_progress"],
              ["Waiting for patient", "support_cases", "waiting_patient"],
              ["Waiting for provider", "support_cases", "waiting_provider"],
              ["Escalated", "support_cases", "escalated"],
              ["Resolved", "support_cases", "resolved"],
            ];
      const counts = await Promise.all(
        counters.map(async ([title, table, status]) => {
          let query = readDb
            .from(table)
            .select("id", { count: "exact", head: true });
          if (org && orgTables.has(table))
            query = query.eq("organization_id", z.uuid().parse(org));
          if (status === "published" && table === "provider_records")
            query = query.not("published_revision", "is", null);
          else if (status) query = query.eq("status", status);
          if (table === "portal_notifications")
            query = query.eq("user_id", context.userId).is("read_at", null);
          const result = await query;
          if (result.error)
            throw new PortalError(
              400,
              "Dashboard counts are temporarily unavailable.",
            );
          return [title, result.count ?? 0];
        }),
      );
      if (portal === "support") {
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(
          Date.parse(`${today}T00:00:00Z`) + 86400000,
        ).toISOString();
        const [assigned, due] = await Promise.all([
          db
            .from("support_cases")
            .select("id", { count: "exact", head: true })
            .eq("assigned_to", context.userId)
            .not("status", "in", "(resolved,closed,cancelled)"),
          db
            .from("support_tasks")
            .select("id", { count: "exact", head: true })
            .eq("assigned_to", context.userId)
            .not("status", "in", "(completed,cancelled)")
            .gte("due_at", `${today}T00:00:00Z`)
            .lt("due_at", tomorrow),
        ]);
        if (assigned.error || due.error)
          throw new PortalError(400, "Queue counts are unavailable.");
        counts.push(
          ["Assigned to me", assigned.count ?? 0],
          ["My tasks due today (UTC)", due.count ?? 0],
        );
      }
      return portalResponse(Object.fromEntries(counts));
    }
    if (["users", "team", "staff"].includes(resource)) {
      const result =
        resource === "users"
          ? await db.rpc("portal_users", {
              p_search: (params.get("q") ?? "").slice(0, 100),
            })
          : resource === "team"
            ? await db.rpc("portal_team", {
                p_organization_id: z.uuid().parse(params.get("organizationId")),
              })
            : await db.rpc("portal_staff_directory", {});
      const data = checked(result) as unknown as Record<string, unknown>[];
      return portalResponse(directoryPage(data, params));
    }
    if (resource === "case_context")
      return portalResponse(
        checked(
          await db.rpc("portal_case_context", {
            p_case_id: z.uuid().parse(params.get("id")),
          }),
        ),
      );
    if (resource === "network_readiness") {
      return portalResponse(checked(await db.rpc("portal_network_readiness", { p_organization_id: params.get("organizationId") ? z.uuid().parse(params.get("organizationId")) : null })));
    }
    if (resource === "listing_status") {
      return portalResponse(
        checked(
          await db.rpc("portal_listing_status", {
            p_organization_id: z.uuid().parse(params.get("organizationId")),
          }),
        ),
      );
    }
    if (resource === "submission_context") {
      const id = z.uuid().parse(params.get("id"));
      const submission = checked(
        await db.from("provider_submissions").select("*").eq("id", id).single(),
      );
      const items = checked(
        await db
          .from("provider_submission_items")
          .select("*")
          .eq("submission_id", id),
      );
      const snapshots = await Promise.all(
        items.map(async (item) => ({
          item,
          record: checked(
            await db
              .from("provider_records")
              .select("*")
              .eq("id", item.record_id)
              .single(),
          ),
          snapshot: checked(
            await db
              .from("provider_revisions")
              .select("*")
              .eq("record_id", item.record_id)
              .eq("revision", item.revision)
              .single(),
          ),
        })),
      );
      const reviews = checked(
        await db
          .from("provider_section_reviews")
          .select("*")
          .eq("submission_id", id)
          .order("sequence", { ascending: false }),
      );
      return portalResponse({ submission, items: snapshots, reviews });
    }
    if (resource === "analytics") {
      const metrics = checked(await db.rpc("portal_analytics", {})) as Record<
        string,
        unknown
      >;
      const publicDb = getPublicSupabaseClient();
      const [hospitals, packages] = await Promise.all([
        publicDb.from("hospitals").select("id", { count: "exact", head: true }),
        publicDb.from("packages").select("id", { count: "exact", head: true }),
      ]);
      if (hospitals.error || packages.error)
        throw new PortalError(400, "Public listing counts are unavailable.");
      const {
        publishedProviders: _providers,
        publishedPackages: _packages,
        ...rest
      } = metrics;
      void _providers;
      void _packages;
      return portalResponse({
        ...rest,
        publicHospitalListings: hospitals.count ?? 0,
        publicPackageListings: packages.count ?? 0,
      });
    }
    if (resource === "published_preview") {
      const org = z.uuid().parse(params.get("organizationId"));
      const records: Database["public"]["Tables"]["provider_records"]["Row"][] =
        [];
      for (let offset = 0; ; offset += 100) {
        const page = checked(
          await db
            .from("provider_records")
            .select("*")
            .eq("organization_id", org)
            .not("published_revision", "is", null)
            .order("id")
            .range(offset, offset + 99),
        );
        records.push(...page);
        if (page.length < 100) break;
      }
      const rows = await Promise.all(
        records.map(async (record) => {
          const revision = checked(
            await db
              .from("provider_revisions")
              .select("*")
              .eq("record_id", record.id)
              .eq("revision", record.published_revision!)
              .single(),
          ) as Database["public"]["Tables"]["provider_revisions"]["Row"];
          return { ...record, ...revision, id: record.id, kind: record.kind };
        }),
      );
      return portalResponse({ rows });
    }
    if (resource === "workload") {
      if (
        !["support_manager", "admin", "super_admin"].includes(
          context.role ?? "",
        )
      )
        throw new PortalError(403, "Team workload requires manager access.");
      const staff = checked(
        await db.rpc("portal_staff_directory", {}),
      ) as unknown as Record<string, unknown>[];
      const staffPage = directoryPage(staff, params);
      const rows = await Promise.all(
        staffPage.rows.map(async (member) => {
          const userId = String(member.id);
          const [cases, tasks, overdue] = await Promise.all([
            db
              .from("support_cases")
              .select("id", { count: "exact", head: true })
              .eq("assigned_to", userId)
              .not("status", "in", "(resolved,closed,cancelled)"),
            db
              .from("support_tasks")
              .select("id", { count: "exact", head: true })
              .eq("assigned_to", userId)
              .not("status", "in", "(completed,cancelled)"),
            db
              .from("support_tasks")
              .select("id", { count: "exact", head: true })
              .eq("assigned_to", userId)
              .not("status", "in", "(completed,cancelled)")
              .lt("due_at", new Date().toISOString()),
          ]);
          [cases, tasks, overdue].forEach((result) => {
            if (result.error)
              throw new PortalError(400, "Team workload is unavailable.");
          });
          return {
            ...member,
            open_cases: cases.count ?? 0,
            open_tasks: tasks.count ?? 0,
            overdue_tasks: overdue.count ?? 0,
          };
        }),
      );
      return portalResponse({
        ...staffPage,
        rows,
      });
    }
    if (!(resource in resources))
      throw new PortalError(404, "This workspace is unavailable.");
    if (adminOnly.has(resource) && portal !== "admin")
      throw new PortalError(
        403,
        "This workspace requires administrator access.",
      );
    if (
      ["conversations", "cases", "document_workspaces"].includes(resource) &&
      portal !== "patient"
    )
      throw new PortalError(
        403,
        "Use the explicitly shared support case context.",
      );
    const table = resource as keyof typeof resources;
    const spec = resources[table];
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10000)
      .parse(params.get("page") ?? 1);
    const size = z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .parse(params.get("size") ?? 20);
    const sortColumns: Partial<Record<keyof typeof resources, string[]>> = {
      support_cases: [
        "title",
        "status",
        "priority",
        "created_at",
        "updated_at",
      ],
      support_tasks: [
        "title",
        "status",
        "priority",
        "due_at",
        "created_at",
        "updated_at",
      ],
      provider_records: [
        "name",
        "status",
        "revision",
        "created_at",
        "updated_at",
      ],
      provider_submissions: ["status", "submitted_at", "updated_at"],
      provider_documents: ["name", "status", "created_at", "expires_on"],
      organizations: ["name", "status", "created_at", "updated_at"],
    };
    const sortAllowed = [
      spec.sort,
      ...(spec.search ? [spec.search] : []),
      ...(sortColumns[table] ?? []),
    ];
    const requestedSort = params.get("sort") ?? spec.sort;
    const sort = sortAllowed.includes(requestedSort)
      ? requestedSort
      : spec.sort;
    const resourceDb = params.get("publicOnly") === "true" && ["hospitals", "doctors", "packages"].includes(table)
      ? getPublicSupabaseClient() as SupabaseClient : readDb;
    let query = resourceDb
      .from(table)
      .select(table === "provider_reference_claims" ? "*,source:source_records(source_name,source_url,source_type,retrieved_at,review_after)" : table === "cities" ? "*,country:countries(name)" : table === "hospitals" ? publicHospitalFields : table === "doctors" ? publicDoctorFields : "*", {
        count: "exact",
      });
    const org = params.get("organizationId");
    if (org && orgTables.has(table))
      query = query.eq("organization_id", z.uuid().parse(org));
    if (table === "organizations" && org)
      query = query.eq("id", z.uuid().parse(org));
    if (table === "organizations" && params.get("origin")) query = query.eq("onboarding_origin", z.enum(["admin_reference", "provider_submitted", "synthetic_qa"]).parse(params.get("origin")));
    if (table === "source_records" && params.get("reference") === "true") query = query.eq("source_kind", "external").not("source_type", "is", null);
    if (params.get("id"))
      query = query.eq(
        table === "portal_accounts" ? "user_id" : "id",
        z.uuid().parse(params.get("id")),
      );
    if (
      params.get("recordId") &&
      [
        "provider_revisions",
        "provider_reference_claims",
        "provider_field_reviews",
        "provider_section_reviews",
        "provider_submission_items",
      ].includes(table)
    )
      query = query.eq("record_id", z.uuid().parse(params.get("recordId")));
    if (params.get("revision") && table === "provider_reference_claims") query = query.eq("revision", z.coerce.number().int().positive().parse(params.get("revision")));
    if (
      params.get("submissionId") &&
      ["provider_submission_items", "provider_section_reviews"].includes(table)
    )
      query = query.eq(
        "submission_id",
        z.uuid().parse(params.get("submissionId")),
      );
    if (
      params.get("caseId") &&
      ["support_case_messages", "support_tasks"].includes(table)
    )
      query = query.eq("case_id", z.uuid().parse(params.get("caseId")));
    if (params.get("kind") && table === "provider_records")
      query = query.eq("kind", params.get("kind")!);
    if (params.get("entity") && table === "catalog_drafts")
      query = query.eq("entity", params.get("entity")!);
    if (params.get("documentKind") && table === "provider_documents")
      query = query.eq("document_type", params.get("documentKind")!);
    if (
      params.get("status") &&
      [
        "provider_records",
        "provider_submissions",
        "provider_documents",
        "support_cases",
        "support_tasks",
        "catalog_drafts",
        "organizations",
      ].includes(table)
    )
      query = query.eq("status", params.get("status")!);
    if (table === "support_cases") {
      if (params.get("patientId"))
        query = query.eq("patient_id", z.uuid().parse(params.get("patientId")));
      if (params.get("sharedDocuments") === "true")
        query = query
          .or("and(share_documents.eq.true,document_workspace_id.not.is.null),inquiry_source.neq.legacy");
      for (const [parameter, column] of [
        ["priority", "priority"],
        ["caseType", "case_type"],
        ["hospitalId", "hospital_id"],
        ["assignedTo", "assigned_to"],
      ] as const) {
        const value = params.get(parameter);
        if (value)
          query = query.eq(
            column,
            parameter === "assignedTo" && value === "me"
              ? context.userId
              : value,
          );
      }
      if (params.get("from"))
        query = query.gte("created_at", z.iso.date().parse(params.get("from")));
      if (params.get("until"))
        query = query.lte(
          "created_at",
          z.iso.date().parse(params.get("until")) + "T23:59:59.999Z",
        );
      if (params.get("unassigned") === "true")
        query = query.is("assigned_to", null);
    }
    if (table === "portal_notifications")
      query = query.eq("user_id", context.userId);
    if (["conversations", "document_workspaces", "cases"].includes(table))
      query = query.eq("owner_id", context.userId);
    const search = (params.get("q") ?? "")
      .replaceAll(/[,%()]/g, " ")
      .slice(0, 100);
    if (search && spec.search) query = query.ilike(spec.search, `%${search}%`);
    const result = await query
      .order(sort, {
        ascending: params.get("direction") === "asc",
        nullsFirst: false,
      })
      .range((page - 1) * size, page * size - 1);
    const resultRows = checked(result);
    const enrichedRows =
      table === "provider_listing_ownership"
        ? resultRows.map(raw => { const row = raw as unknown as Record<string, unknown>; return {...row, id: `${row.entity_kind}:${row.entity_id}`}; })
        : table === "provider_submissions"
        ? await Promise.all(
            resultRows.map(async (row) => ({
              ...(row as unknown as Record<string, unknown>),
              ...(checked(
                await db.rpc("portal_submission_summary", {
                  p_submission_id: String(
                    (row as unknown as { id: string }).id,
                  ),
                }),
              ) as Record<string, unknown>),
            })),
          )
        : resultRows;
    return portalResponse({
      rows: enrichedRows,
      total: result.count ?? 0,
      page,
      size,
    });
  } catch (error) {
    return portalFailure(error);
  }
}

const portalActions = [
  "create_organization",
  "save_record",
  "duplicate_record",
  "submit",
  "assign_reviewer",
  "review_submission",
  "review_field",
  "review_section",
  "open_submission",
  "invite_member",
  "accept_invite",
  "update_member",
  "revoke_invite",
  "review_document",
  "organization_message",
  "mark_notification",
  "save_preferences",
  "set_staff_role",
  "set_account_status",
  "organization_status",
  "save_setting",
] as const;
const supportActions = [
  "create_case",
  "revoke_consent",
  "message",
  "update_case",
  "save_task",
] as const;
const publicationActions = [
  "publish_submission",
  "archive_record",
  "unpublish_record",
  "expire_record",
] as const;
const catalogActions = [
  "create_source",
  "save_catalog_draft",
  "approve_catalog",
  "archive_catalog_draft",
  "publish_catalog",
  "unpublish_catalog",
] as const;
const commandSchema = z
  .object({
    action: z.enum([
      ...operationsActions,
      ...portalActions,
      ...networkActions,
      ...supportActions,
      ...publicationActions,
      ...catalogActions,
      "create_reference_organization",
      "create_reference_source",
      "attach_reference_claim",
      "review_reference_claims",
    ]),
    input: z.record(z.string(), z.unknown()),
  })
  .strict();
export async function POST(request: NextRequest) {
  try {
    const { db, user, context } = await portalSession(request);
    if (Number(request.headers.get("content-length") ?? 0) > 100000)
      throw new PortalError(413, "This change is too large.");
    const body = commandSchema.parse(await request.json());
    if ((operationsActions as readonly string[]).includes(body.action)) {
      if (!['admin','super_admin'].includes(context.role ?? '')) throw new PortalError(403, 'Administrator access is required.');
      const command = operationsCommandSchema.parse(body);
      return portalResponse(command.action === 'operations_health_check' ? await recordHealth(db, user.id, command.input.operationId) : checked(await db.rpc('operations_command', {p_action: command.action, p_input: command.input as Json}).abortSignal(AbortSignal.timeout(5000))));
    }
    if ((networkActions as readonly string[]).includes(body.action)) body.input = networkCommandSchema.parse(body).input;
    if (body.action === "create_reference_organization") body.input=referenceOrganizationSchema.parse(body.input);
    if (body.action === "create_reference_source") body.input=referenceSourceSchema.parse(body.input);
    if (body.action === "attach_reference_claim") body.input=referenceClaimSchema.parse(body.input);
    if (body.action === "review_reference_claims") body.input=referenceReviewSchema.parse(body.input);
    if (body.action === "create_case" && body.input.consent !== true)
      throw new PortalError(
        400,
        "Patient consent is required for this action.",
      );
    if (body.action === "save_record") recordInputSchema.parse(body.input);
    if (JSON.stringify(body.input).length > 60000)
      throw new PortalError(413, "This change is too large.");
    const rpc = ["create_reference_organization", "create_reference_source", "attach_reference_claim", "review_reference_claims"].includes(body.action) ? "portal_reference_command" : ["review_section", "open_submission"].includes(body.action)
      ? "portal_review_command"
      : (supportActions as readonly string[]).includes(body.action)
        ? "support_command"
        : (publicationActions as readonly string[]).includes(body.action)
          ? "portal_publication_command"
          : (catalogActions as readonly string[]).includes(body.action)
            ? "portal_catalog_command"
            : "portal_command";
    return portalResponse(
      checked(
        await db.rpc(rpc, {
          p_action: body.action,
          p_input: body.input as Json,
        }),
      ),
    );
  } catch (error) {
    return portalFailure(error);
  }
}
import { publicHospitalFields, publicDoctorFields } from "@/lib/catalog/public-fields";
