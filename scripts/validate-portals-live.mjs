/** Opt-in live integration gate. Uses isolated synthetic accounts, never real patient records.
 * node --env-file=.env.local scripts/validate-portals-live.mjs [--browser]
 * MEDBRIDGE_PORTAL_LIVE_TEST=1 is required. The browser broker is localhost only,
 * uses ordinary Supabase sessions and the existing auth callback, and is never deployed.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";

if (process.env.MEDBRIDGE_PORTAL_LIVE_TEST !== "1")
  throw new Error(
    "Set MEDBRIDGE_PORTAL_LIVE_TEST=1 to run the authorized synthetic integration gate.",
  );
const origin = process.env.MEDBRIDGE_TEST_ORIGIN ?? "http://127.0.0.1:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(
  url,
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actors = {};
const orgs = [];
const documents = [];
const stamp = randomUUID().slice(0, 8);
let passed = 0;
function check(condition, message) {
  assert(condition, message);
  passed++;
  console.log(`PASS ${passed}: ${message}`);
}
function db(result) {
  if (result.error)
    throw new Error(`Database gate failed: ${result.error.message}`);
  return result.data;
}
async function api(actor, portal, resource, params = {}, input) {
  const query = new URLSearchParams({
    portal,
    ...(resource ? { resource } : {}),
    ...params,
  });
  const response = await fetch(`${origin}/api/portals?${query}`, {
    method: input ? "POST" : "GET",
    headers: {
      ...(actor
        ? { Authorization: `Bearer ${actors[actor].session.access_token}` }
        : {}),
      ...(input ? { "Content-Type": "application/json" } : {}),
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const data = await response.json();
  return { status: response.status, data };
}
async function command(actor, portal, action, input) {
  const result = await api(actor, portal, "", {}, { action, input });
  assert.equal(result.status, 200, `${action}: ${JSON.stringify(result.data)}`);
  return result.data;
}
async function cleanup() {
  const failures = [];
  const finish = async (label, operation) => {
    try {
      const result = await operation;
      if (result.error) failures.push(`${label}: ${result.error.message}`);
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  };
  for (const org of orgs)
    await finish(
      "archive organization",
      admin.from("organizations").update({ status: "archived" }).eq("id", org),
    );
  if (documents.length) {
    await finish(
      "archive document metadata",
      admin
        .from("provider_documents")
        .update({ status: "archived" })
        .in("storage_path", documents),
    );
    await finish(
      "remove synthetic files",
      admin.storage.from("provider-documents").remove(documents),
    );
  }
  for (const actor of Object.values(actors)) {
    await finish(
      "disable fixture role",
      admin
        .from("staff_roles")
        .update({ active: false })
        .eq("user_id", actor.id),
    );
    await finish(
      "disable fixture account",
      admin
        .from("portal_accounts")
        .upsert({ user_id: actor.id, active: false }),
    );
    await finish(
      "ban fixture sign-in",
      admin.auth.admin.updateUserById(actor.id, {
        ban_duration: "876000h",
      }),
    );
  }
  assert.equal(failures.length, 0, failures.join("; "));
  console.log(
    "Synthetic accounts disabled and organizations archived; immutable audit history retained.",
  );
}
try {
  for (const name of ["provider", "other", "patient", "support", "admin"]) {
    const email = `medbridge-portal-${name}-${stamp}@qa.invalid`;
    const password = `${randomUUID()}-${randomUUID().slice(0, 12)}`;
    const user = db(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: `QA ONLY ${name}` },
      }),
    ).user;
    actors[name] = {
      id: user.id,
      email,
      client: createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    };
    actors[name].session = db(
      await actors[name].client.auth.signInWithPassword({ email, password }),
    ).session;
  }
  db(
    await admin
      .from("staff_roles")
      .insert({ user_id: actors.admin.id, role: "super_admin" }),
  );
  await command("admin", "admin", "set_staff_role", {
    userId: actors.support.id,
    role: "support_agent",
    active: true,
  });
  check(
    (await api(null, "provider", "context")).status === 401,
    "Unauthenticated portal API denied",
  );
  check(
    (await api("provider", "admin", "context")).status === 403,
    "Provider cannot enter Admin portal",
  );
  check(
    (await api("patient", "support", "context")).status === 403,
    "Patient cannot enter Support portal",
  );
  const org = await command("provider", "provider", "create_organization", {
    name: `QA ONLY Portal Hospital ${stamp}`,
    providerType: "hospital",
    sourceKind: "synthetic",
  });
  orgs.push(org.id);
  const otherOrg = await command("other", "provider", "create_organization", {
    name: `QA ONLY Other Organization ${stamp}`,
    providerType: "clinic",
    sourceKind: "synthetic",
  });
  orgs.push(otherOrg.id);
  const city = db(
    await anon.from("cities").select("id").eq("slug", "mumbai").single(),
  );
  const specialty = db(await anon.from("specialties").select("id").limit(1))[0];
  const treatment = db(await anon.from("treatments").select("id,name").limit(1))[0];
  const records = [];
  for (const [kind, name, data] of [
    [
      "organization",
      org.name,
      {
        cityId: city.id,
        description: "Synthetic QA organization. No real care services.",
        email: "qa@qa.invalid",
        phone: "00000000",
        website: "https://example.com",
        providerType: "hospital",
      },
    ],
    [
      "location",
      "QA ONLY Location",
      {
        cityId: city.id,
        address: "Synthetic address for workflow testing",
        phone: "00000000",
      },
    ],
    ["specialty", "QA ONLY Department", { specialtyId: specialty.id }],
    ["treatment", "QA ONLY Treatment offering", { treatmentId: treatment.id }],
    [
      "doctor",
      `QA ONLY Doctor ${stamp}`,
      {
        specialtyId: specialty.id,
        biography: "Synthetic doctor used only for testing. No real clinician.",
        experienceYears: 3,
        languages: ["English"],
        consultationMode: "both",
      },
    ],
    ["facility", "QA ONLY Beds", { facilityType: "beds", quantity: 12 }],
    [
      "package",
      `QA ONLY Package ${stamp}`,
      {
        treatmentId: treatment.id,
        description: "Synthetic package; not a medical offer.",
        currency: "INR",
        price: 25000,
        durationDays: 3,
        inclusions: ["Synthetic inclusion"],
        exclusions: ["Flights"],
      },
    ],
    [
      "international_service",
      "QA ONLY Information desk",
      {
        serviceType: "international_patient_desk",
        description: "Synthetic service used for testing only.",
        included: false,
      },
    ],
  ])
    records.push(
      await command("provider", "provider", "save_record", {
        organizationId: org.id,
        kind,
        name,
        data,
      }),
    );
  check(
    records.length === 8,
    "All structured provider record kinds save as private drafts",
  );
  check(
    (
      await api("other", "provider", "provider_records", {
        organizationId: org.id,
      })
    ).data.rows.length === 0,
    "Other organization cannot read private drafts",
  );
  const crossEdit = await api(
    "other",
    "provider",
    "",
    {},
    {
      action: "save_record",
      input: {
        organizationId: org.id,
        recordId: records[0].id,
        expectedRevision: 1,
        kind: "organization",
        name: "Cross tenant edit",
        data: records[0].data,
      },
    },
  );
  check(crossEdit.status === 403, "Cross-tenant write denied");
  const form = new FormData();
  form.set("organizationId", org.id);
  form.set("documentType", "supporting_evidence");
  form.set(
    "file",
    new Blob(["%PDF-1.4\n% Synthetic MedBridge QA evidence\n%%EOF"], {
      type: "application/pdf",
    }),
    "qa-evidence.pdf",
  );
  const upload = await fetch(
    `${origin}/api/portals/documents?portal=provider`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${actors.provider.session.access_token}`,
      },
      body: form,
    },
  );
  const document = await upload.json();
  assert.equal(upload.status, 200, JSON.stringify(document));
  documents.push(`${org.id}/${document.id}`);
  check(
    Boolean(document.id),
    "Private provider document upload persists metadata",
  );
  const privateDownload = await fetch(
    `${origin}/api/portals/documents?portal=provider&id=${document.id}`,
    {
      headers: { Authorization: `Bearer ${actors.other.session.access_token}` },
    },
  );
  check(
    privateDownload.status !== 200,
    "Cross-tenant document download denied",
  );
  const publicDownload = await anon.storage
    .from("provider-documents")
    .download(documents[0]);
  check(
    Boolean(publicDownload.error),
    "Private document bucket rejects anonymous download",
  );
  await command("admin", "admin", "review_document", {
    documentId: document.id,
    status: "approved",
    message: "Synthetic evidence reviewed for test only.",
  });
  const submission = await command("provider", "provider", "submit", {
    organizationId: org.id,
  });
  await command("admin", "admin", "assign_reviewer", {
    submissionId: submission.id,
    userId: actors.support.id,
  });
  check(
    (
      await api("support", "support", "submission_context", {
        id: submission.id,
      })
    ).status === 200,
    "Assigned Support reviewer can read frozen submission",
  );
  await command("support", "support", "review_submission", {
    submissionId: submission.id,
    status: "changes_requested",
    message: "Clarify synthetic organization overview.",
  });
  check(
    (await api("provider", "provider", "portal_notifications")).data.total > 0,
    "Provider receives persisted review notification",
  );
  const profile = (
    await api("provider", "provider", "provider_records", { id: records[0].id })
  ).data.rows[0];
  await command("provider", "provider", "save_record", {
    organizationId: org.id,
    recordId: profile.id,
    expectedRevision: profile.revision,
    kind: "organization",
    name: org.name,
    data: {
      ...profile.data,
      description: "Revised synthetic QA organization. No real care services.",
    },
  });
  const resubmission = await command("provider", "provider", "submit", {
    organizationId: org.id,
  });
  await command("admin", "admin", "review_submission", {
    submissionId: resubmission.id,
    status: "approved",
  });
  await command("admin", "admin", "publish_submission", {
    submissionId: resubmission.id,
  });
  const hospital = db(
    await admin
      .from("organizations")
      .select("hospital_id")
      .eq("id", org.id)
      .single(),
  ).hospital_id;
  check(
    db(await anon.from("hospitals").select("id").eq("id", hospital)).length ===
      1,
    "Approved frozen hospital snapshot becomes public",
  );
  const publicPackage = db(
    await anon
      .from("packages")
      .select("currency,estimated_min")
      .eq("name", `QA ONLY Package ${stamp}`),
  )[0];
  check(
    publicPackage.currency === "INR" && publicPackage.estimated_min === 25000,
    "Public package preserves original currency and price",
  );
  const search = db(
    await anon.rpc("search_catalog_candidates", { p_terms: org.name }),
  );
  check(
    search.some((row) => row.kind === "hospitals"),
    "Existing discovery search reads newly published provider",
  );
  const current = (
    await api("provider", "provider", "provider_records", { id: profile.id })
  ).data.rows[0];
  await command("provider", "provider", "save_record", {
    organizationId: org.id,
    recordId: profile.id,
    expectedRevision: current.revision,
    kind: "organization",
    name: `SECRET DRAFT ${stamp}`,
    data: current.data,
  });
  check(
    db(await anon.from("hospitals").select("name").eq("id", hospital).single())
      .name === org.name,
    "Later private draft cannot alter published snapshot",
  );
  const preview = await api("provider", "provider", "published_preview", {
    organizationId: org.id,
  });
  check(
    preview.status === 200 &&
      preview.data.rows.find((row) => row.kind === "organization").name ===
        org.name,
    "Provider published preview uses exact immutable revisions",
  );
  const supportCase = await command("patient", "patient", "create_case", {
    title: "QA ONLY coordination request",
    description: "Synthetic request, no patient health information.",
    consent: true,
    hospitalId: hospital,
    shareWithProvider: true,
  });
  await command("support", "support", "update_case", {
    caseId: supportCase.id,
    expectedRevision: 1,
    assignedTo: actors.support.id,
    status: "in_progress",
  });
  await command("support", "support", "message", {
    caseId: supportCase.id,
    visibility: "internal",
    body: `INTERNAL QA SECRET ${stamp}`,
  });
  await command("support", "support", "message", {
    caseId: supportCase.id,
    visibility: "shared",
    body: "Synthetic shared coordination reply.",
  });
  await command("support", "support", "save_task", {
    caseId: supportCase.id,
    title: "QA ONLY follow up request",
    assignedTo: actors.support.id,
  });
  const patientContext = await api("patient", "patient", "case_context", {
    id: supportCase.id,
  });
  check(
    patientContext.status === 200 &&
      !JSON.stringify(patientContext.data).includes("INTERNAL QA SECRET") &&
      patientContext.data.tasks.length === 0,
    "Patient context hides internal notes and staff tasks",
  );
  const providerContext = await api("provider", "provider", "case_context", {
    id: supportCase.id,
  });
  check(
    providerContext.status === 200 &&
      !JSON.stringify(providerContext.data).includes("INTERNAL QA SECRET"),
    "Provider context hides internal staff notes",
  );
  check(
    (await api("other", "provider", "case_context", { id: supportCase.id }))
      .status === 403,
    "Unrelated organization cannot read support case",
  );
  check(
    (await api("support", "support", "conversations")).status === 403,
    "Support cannot browse unrelated patient conversations",
  );
  const audit = await api("admin", "admin", "audit_events", {
    organizationId: org.id,
  });
  check(
    audit.status === 200 && audit.data.total >= 20,
    "Immutable provider workflow audit persisted",
  );
  db(
    await actors.provider.client.auth.updateUser({
      data: { role: "super_admin" },
    }),
  );
  actors.provider.session = db(
    await actors.provider.client.auth.refreshSession(),
  ).session;
  check(
    (await api("provider", "admin", "context")).status === 403,
    "User-editable metadata cannot grant Administrator access",
  );
  const missingConsent = await api(
    "patient",
    "patient",
    "",
    {},
    { action: "create_case", input: { title: "QA ONLY missing consent" } },
  );
  check(
    missingConsent.status !== 200,
    "Missing explicit support consent is rejected by the API",
  );
  const directConsent = await actors.patient.client.rpc("support_command", {
    p_action: "create_case",
    p_input: { title: "QA ONLY missing direct consent" },
  });
  check(
    Boolean(directConsent.error?.message.includes("PORTAL_CONSENT_REQUIRED")),
    "Direct RPC cannot bypass explicit support consent",
  );
  const copied = await command("provider", "provider", "duplicate_record", {
    recordId: records.find((row) => row.kind === "doctor").id,
  });
  check(
    copied.status === "draft" &&
      copied.id !== records.find((row) => row.kind === "doctor").id,
    "Duplicate creates an independent private draft",
  );
  await command("provider", "provider", "archive_record", {
    recordId: copied.id,
    expectedRevision: copied.revision,
    confirmed: true,
  });
  check(
    (await api("provider", "provider", "provider_records", { id: copied.id }))
      .data.rows[0].status === "archived",
    "Provider can archive an unpublished draft with confirmation",
  );
  const packageRecord = records.find((row) => row.kind === "package");
  check(
    (
      await api(
        "provider",
        "provider",
        "",
        {},
        {
          action: "unpublish_record",
          input: {
            recordId: packageRecord.id,
            expectedRevision: packageRecord.revision,
            confirmed: true,
          },
        },
      )
    ).status === 403,
    "Provider cannot bypass Administrator publication controls",
  );
  await command("admin", "admin", "set_staff_role", {
    userId: actors.other.id,
    role: "support_agent",
    active: true,
  });
  check(
    (await api("other", "support", "case_context", { id: supportCase.id }))
      .status === 403,
    "Other Support Agent cannot read an assigned case",
  );
  let caseRow = (
    await api("support", "support", "case_context", { id: supportCase.id })
  ).data.case;
  await command("support", "support", "update_case", {
    caseId: supportCase.id,
    expectedRevision: caseRow.revision,
    status: "escalated",
    reason: "Synthetic test escalation requiring manager follow-up.",
  });
  caseRow = (
    await api("support", "support", "case_context", { id: supportCase.id })
  ).data.case;
  check(
    caseRow.status === "escalated",
    "Escalation persists a reason and actual case state",
  );
  await command("support", "support", "update_case", {
    caseId: supportCase.id,
    expectedRevision: caseRow.revision,
    status: "resolved",
  });
  caseRow = (
    await api("support", "support", "case_context", { id: supportCase.id })
  ).data.case;
  check(
    (
      await api(
        "support",
        "support",
        "",
        {},
        {
          action: "update_case",
          input: {
            caseId: supportCase.id,
            expectedRevision: caseRow.revision,
            status: "open",
          },
        },
      )
    ).status === 400 &&
      (await api("support", "support", "case_context", { id: supportCase.id })).data.case.status === "resolved",
    "Agent cannot reopen a resolved case without manager authority",
  );
  await command("admin", "admin", "update_case", {
    caseId: supportCase.id,
    expectedRevision: caseRow.revision,
    status: "open",
  });
  const workload = await api("admin", "admin", "workload");
  check(
    workload.status === 200 &&
      workload.data.rows.some(
        (row) =>
          row.id === actors.support.id &&
          row.open_cases >= 1 &&
          row.open_tasks >= 1,
      ),
    "Manager workload counts reflect actual assigned cases and tasks",
  );
  const task = (
    await api("support", "support", "support_tasks", { caseId: supportCase.id })
  ).data.rows[0];
  await command("support", "support", "save_task", {
    caseId: supportCase.id,
    taskId: task.id,
    expectedRevision: task.revision,
    title: task.title,
    assignedTo: actors.support.id,
    status: "completed",
  });
  check(
    (
      await api("support", "support", "support_tasks", {
        caseId: supportCase.id,
      })
    ).data.rows[0].status === "completed",
    "Task completion persists with revision protection",
  );
  const invite = await command("provider", "provider", "invite_member", {
    organizationId: org.id,
    email: actors.other.email,
    role: "provider_editor",
  });
  check(
    (
      await api(
        "patient",
        "provider",
        "",
        {},
        { action: "accept_invite", input: { inviteId: invite.id } },
      )
    ).status !== 200,
    "Organization invitation rejects a different email",
  );
  await command("other", "provider", "accept_invite", { inviteId: invite.id });
  check(
    (
      await api("other", "provider", "provider_records", {
        organizationId: org.id,
      })
    ).data.rows.length > 0,
    "Matching-email invitation grants the assigned tenant membership",
  );
  const editedProfile = (
    await api("provider", "provider", "provider_records", { id: profile.id })
  ).data.rows[0];
  check(
    (
      await api(
        "provider",
        "provider",
        "",
        {},
        {
          action: "save_record",
          input: {
            organizationId: org.id,
            recordId: profile.id,
            expectedRevision: 1,
            kind: "organization",
            name: org.name,
            data: editedProfile.data,
          },
        },
      )
    ).status !== 200,
    "Stale draft revision cannot overwrite newer work",
  );
  await command("admin", "admin", "organization_status", {
    organizationId: org.id,
    status: "suspended",
  });
  check(
    db(await anon.from("hospitals").select("id").eq("id", hospital)).length ===
      0,
    "Suspended organization disappears from public catalog",
  );
  await command("admin", "admin", "organization_status", {
    organizationId: org.id,
    status: "active",
  });
  check(
    db(await anon.from("hospitals").select("id").eq("id", hospital)).length ===
      1,
    "Reactivation restores the existing published snapshot",
  );
  const assistant = await fetch(`${origin}/api/assistant`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${actors.patient.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: `Find hospitals for ${treatment.name} in Mumbai named "${org.name}".` }),
  });
  const answer = await assistant.json();
  check(
    assistant.status === 200 &&
      answer.findings?.some(
        (finding) => finding.provenance?.recordId === hospital,
      ),
    `Existing live assistant discovers the newly published provider: ${JSON.stringify({status:assistant.status,error:answer.error,code:answer.code,summary:answer.summary,findings:answer.findings?.map(item=>({title:item.title,id:item.provenance?.recordId}))})}`,
  );
  const verification = await fetch(
    `${origin}/api/portals/verification?portal=support`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${actors.support.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ organizationId: org.id }),
    },
  );
  const verificationResult = await verification.json();
  assert.equal(verification.status, 200, JSON.stringify(verificationResult));
  check(
    (
      await api("support", "support", "portal_verification_checks", {
        organizationId: org.id,
      })
    ).data.total > 0,
    "Assigned reviewer can read history from the existing verification tool",
  );
  check(
    (
      await api("patient", "patient", "portal_verification_checks", {
        organizationId: org.id,
      })
    ).data.total === 0,
    "Patient cannot browse private provider verification history",
  );
  for (const [actor, portal, names] of [
    [
      "provider",
      "provider",
      [
        "context",
        "stats",
        "provider_records",
        "provider_revisions",
        "provider_submissions",
        "provider_documents",
        "portal_notifications",
        "audit_events",
        "team",
        "published_preview",
      ],
    ],
    [
      "support",
      "support",
      [
        "context",
        "stats",
        "support_cases",
        "support_tasks",
        "users",
        "portal_notifications",
        "audit_events",
        "staff",
      ],
    ],
    [
      "admin",
      "admin",
      [
        "context",
        "stats",
        "analytics",
        "workload",
        "users",
        "staff",
        "catalog_drafts",
        "portal_settings",
        "source_records",
        "hospitals",
        "doctors",
        "packages",
        "treatments",
        "specialties",
        "countries",
        "cities",
        "healthcare_services",
      ],
    ],
  ]) {
    for (const resource of names) {
      const result = await api(actor, portal, resource, {
        organizationId: org.id,
        size: "1",
      });
      assert.equal(
        result.status,
        200,
        `${portal}/${resource}: ${JSON.stringify(result.data)}`,
      );
    }
    check(
      true,
      `${portal} navigation read models return authorized persisted data`,
    );
  }
  console.log(`Live portal integration: ${passed} gates passed.`);
  if (process.argv.includes("--browser")) {
    let finishBrowser;
    const browserDone = new Promise((resolve) => {
      finishBrowser = resolve;
    });
    const broker = createServer((request, response) => {
      if (request.url === "/finish" && request.method === "POST") {
        response.writeHead(200, { "Cache-Control": "no-store" });
        response.end("Finishing synthetic browser validation.");
        finishBrowser();
        return;
      }
      const role = request.url?.slice(1);
      if (!["provider", "admin", "support", "patient"].includes(role)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const session = actors[role].session;
      const next = role === "patient" ? "/help" : `/${role}/dashboard`;
      const fragment = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        token_type: "bearer",
        type: "signup",
      });
      response.writeHead(302, {
        Location: `${origin}/auth/callback?next=${encodeURIComponent(next)}#${fragment}`,
        "Cache-Control": "no-store",
      });
      response.end();
    });
    await new Promise((resolve) => broker.listen(4318, "127.0.0.1", resolve));
    console.log(
      "Local browser session broker ready on port 4318. Stop with Ctrl+C after UI tests.",
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
      browserDone.then(resolve);
    });
    await new Promise((resolve) => broker.close(resolve));
  }
  await command("patient", "patient", "revoke_consent", {
    caseId: supportCase.id,
  });
  check(
    (await api("support", "support", "case_context", { id: supportCase.id }))
      .status === 403,
    "Revoked consent immediately removes staff case access",
  );
} finally {
  await cleanup();
}
