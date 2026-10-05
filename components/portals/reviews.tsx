"use client";
import { LocalNumber } from '@/components/experience/translation';


import { T } from '@/components/experience/translation';
import { useEffect, useRef, useState } from "react";
import { ReferenceClaims } from "./reference-claims";
import { PackageReview } from './package-review';
import { label, type Row } from "@/lib/portals/config";
import {
  Action,
  date,
  ErrorPanel,
  Loading,
  Modal,
  Panel,
  ResourceTable,
  Status,
  usePortal,
  useResource,
} from "./core";
import { CommandForm } from "./command-form";
import { FieldControl } from "./record-form";
import { useForm } from "react-hook-form";
import { VerificationResults } from "@/components/assistant/verification-results";
import { verificationReportSchema } from "@/lib/verification/schemas";

export function Submissions({ organizationId }: { organizationId?: string }) {
  const [selected, setSelected] = useState<Row>();
  const { portal, referenceMode } = usePortal();
  const [checkedRows, setCheckedRows] = useState<Record<string, Row>>({});
  const [bulk, setBulk] = useState(false);
  return (
    <>
      <ResourceTable
        resource="provider_submissions"
        title="Submission workspace"
        params={organizationId ? { organizationId } : {}}
        columns={[
          ...(portal === "admin"
            ? [
                {
                  key: "selection",
                  label: "Select",
                  render: (row: Row) => (
                    <input
                      type="checkbox"
                      aria-label={`Select submission ${String(row.id).slice(0, 8)}`}
                      checked={Boolean(checkedRows[String(row.id)])}
                      onChange={(event) =>
                        setCheckedRows((previous) => {
                          const next = { ...previous };
                          if (event.target.checked) next[String(row.id)] = row;
                          else delete next[String(row.id)];
                          return next;
                        })
                      }
                    />
                  ),
                },
              ]
            : []),
          {
            key: "id",
            label: "Submission",
            render: (row) => String(row.id).slice(0, 8),
          },
          { key: "message", label: referenceMode ? "Reference review note" : "Provider response" },
          { key: "organizationName", label: "Organization" },
          { key: "providerName", label: "Submitted by", render: (row) => referenceMode ? "MedBridge Admin" : String(row.providerName ?? "Submitting member") },
          { key: "reviewerName", label: "Reviewer" },
          {
            key: "approvedSections",
            label: "Section review",
            render: (row) =>
              `${row.approvedSections ?? 0}/${row.sectionCount ?? 0} approved`,
          },
          { key: "verificationIssues", label: "Flagged fields" },
          {
            key: "status",
            label: "Status",
            render: (row) => <Status value={row.status} />,
          },
          {
            key: "submitted_at",
            label: "Submitted",
            render: (row) => date(row.submitted_at),
          },
          { key: "review_message", label: "Review feedback" },
          {
            key: "updated_at",
            label: "Updated",
            render: (row) => date(row.updated_at),
          },
        ]}
        onOpen={setSelected}
        extra={
          portal === "admin" && (
            <button
              className="portal-button secondary"
              disabled={!Object.keys(checkedRows).length}
              onClick={() => setBulk(true)}
            >
              <T>{"Review selected ("}</T>{Object.keys(checkedRows).length})
            </button>
          )
        }
      />
      {bulk && (
        <BulkReview
          rows={Object.values(checkedRows)}
          onClose={() => {
            setBulk(false);
            setCheckedRows({});
          }}
        />
      )}
      {selected && (
        <SubmissionDetail
          id={String(selected.id)}
          onClose={() => setSelected(undefined)}
        />
      )}{" "}
      {(portal === "provider" || portal === "admin" && referenceMode) && organizationId && (
        <Panel title="Submit current draft changes">
          <p>
            <T>{"All eligible draft and revised sections are frozen into one submission. Published versions remain visible until approved replacements are published."}</T></p>
          <CommandForm
            action="submit"
            input={{ organizationId }}
            fields={[
              {
                key: "message",
                label: "Message / response to review",
                type: "textarea",
              },
            ]}
            submit="Submit for review"
          />
        </Panel>
      )}
    </>
  );
}
function BulkReview({ rows, onClose }: { rows: Row[]; onClose: () => void }) {
  const { command } = usePortal();
  const { data } = useResource<{ rows: Row[] }>("staff", { size: "200" });
  const [action, setAction] = useState("approved");
  const [message, setMessage] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  return (
    <Modal
      title={`Review ${rows.length} selected submissions`}
      onClose={onClose}
    >
      <p>
        <T>{"Each submission is checked and audited independently. Open its frozen snapshot and evidence before approving it."}</T></p>
      <form
        className="portal-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          let saved = 0;
          const errors: string[] = [];
          for (const row of rows) {
            try {
              await command(
                action === "assign" ? "assign_reviewer" : "review_submission",
                {
                  submissionId: row.id,
                  ...(action === "assign"
                    ? { userId: reviewer }
                    : { status: action, message }),
                },
              );
              saved++;
            } catch (err) {
              errors.push(
                `${String(row.id).slice(0, 8)}: ${err instanceof Error ? err.message : "Action failed"}`,
              );
            }
          }
          setResult(
            `${saved} of ${rows.length} saved.${errors.length ? ` ${errors.join("; ")}` : ""}`,
          );
          setBusy(false);
        }}
      >
        <label className="portal-field">
          <span><T>{"Action"}</T></span>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="approved"><T>{"Approve"}</T></option>
            <option value="changes_requested"><T>{"Request changes"}</T></option>
            <option value="rejected"><T>{"Reject"}</T></option>
            <option value="assign"><T>{"Assign reviewer"}</T></option>
          </select>
        </label>
        {action === "assign" ? (
          <label className="portal-field">
            <span><T>{"Reviewer"}</T></span>
            <select
              required
              value={reviewer}
              onChange={(event) => setReviewer(event.target.value)}
            >
              <option value=""><T>{"Select reviewer"}</T></option>
              {data?.rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {String(row.name)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="portal-field">
            <span><T>{"Review reason"}</T></span>
            <textarea
              required={action !== "approved"}
              minLength={action !== "approved" ? 5 : undefined}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
        )}
        <button className="portal-button" disabled={busy || Boolean(result)}>
          <T>{busy ? "Saving decisions…" : "Confirm selected actions"}</T>
        </button>
        {result && <p role="status">{result}</p>}
      </form>
    </Modal>
  );
}
export function SubmissionDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { portal, command } = usePortal();
  const staff = portal === "admin" || portal === "support";
  const opened = useRef<string | null>(null);
  const [openError, setOpenError] = useState("");
  useEffect(() => {
    if (!staff || opened.current === id) return;
    opened.current = id;
    command("open_submission", { submissionId: id }).catch((error) =>
      setOpenError(
        error instanceof Error
          ? error.message
          : "Unable to record review access.",
      ),
    );
  }, [command, id, staff]);
  const [selected, setSelected] = useState<Row>();
  const { data, error, loading } = useResource<{
    submission: Row;
    items: { record: Row; snapshot: Row }[];
    reviews: Row[];
  }>("submission_context", { id });
  return (
    <Modal title={`Submission ${id.slice(0, 8)}`} onClose={onClose}>
      {openError && <ErrorPanel message={openError} />}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorPanel message={error} />
      ) : (
        data && (
          <>
            <div className="portal-actions">
              <Status value={data.submission.status} />
              <span>{date(data.submission.submitted_at)}</span>
            </div>
            <p>{String(data.submission.message ?? "No provider message.")}</p>
            {data.submission.review_message && (
              <div className="portal-review-feedback">
                <h3><T>{"Review feedback"}</T></h3>
                <p>{String(data.submission.review_message)}</p>
              </div>
            )}
            <div className="portal-review-items">
              {data.items.map(({ record, snapshot }) => (
                <article className="portal-review-card" key={record.id}>
                  <header>
                    <h3>{String(snapshot.name)}</h3>
                    <Status value={record.kind} />
                  </header>
                  <p>
                    <T>{"Frozen revision"}</T>{' '}{snapshot.revision} <T>{"· current revision"}</T>{" "}
                    {record.revision}
                  </p>
                  <Status
                    value={
                      data.reviews.find(
                        (review) => review.record_id === record.id,
                      )?.status ?? "awaiting_review"
                    }
                  />
                  {data.reviews
                    .filter((review) => review.record_id === record.id)
                    .slice(0, 1)
                    .map((review) => (
                      <div className="portal-review-feedback" key={review.id}>
                        <p>{String(review.comment || "No section comment.")}</p>
                        {Boolean(review.reason) && (
                          <p><T>{"Reason:"}</T>{' '}{String(review.reason)}</p>
                        )}
                        <small>
                          <T>{"Reviewed"}</T>{' '}{date(review.created_at)} <T>{"· revision"}</T>{" "}
                          {String(review.revision)}
                        </small>
                      </div>
                    ))}
                  <dl className="portal-facts">
                    {Object.entries(snapshot.data ?? {}).map(([key, value]) => (
                      <div key={key}>
                        <dt>{label(key.replace(/([A-Z])/g, " $1"))}</dt>
                        <dd>
                          {Array.isArray(value)
                            ? value.join(", ")
                            : String(value ?? "Not provided")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {staff && (
                    <button
                      className="portal-button secondary"
                      onClick={() =>
                        setSelected({ ...record, ...snapshot, id: record.id })
                      }
                    >
                      <T>{"Review section & evidence"}</T></button>
                  )}
                </article>
              ))}
            </div>
            {staff &&
              ["submitted", "under_review"].includes(
                String(data.submission.status),
              ) && (
                <Panel title="Review decision">
                  <p>
                    <T>{"Record each section decision first. Request changes here to unlock drafts for the provider. Only an administrator can approve after every section is approved."}</T></p>
                  <CommandForm
                    action="review_submission"
                    input={{ submissionId: id }}
                    fields={[
                      {
                        key: "status",
                        label: "Decision",
                        type: "select",
                        options: [
                          "under_review",
                          "changes_requested",
                          ...(portal === "admin" ? ["approved"] : []),
                          "rejected",
                        ],
                      },
                      {
                        key: "message",
                        label: "Review reason / requested changes",
                        type: "textarea",
                      },
                    ]}
                    submit="Save review decision"
                  />
                </Panel>
              )}
            {portal === "admin" && (
              <>
                <Panel title="Assign reviewer">
                  <CommandForm
                    action="assign_reviewer"
                    input={{ submissionId: id }}
                    fields={[
                      {
                        key: "userId",
                        label: "Reviewer",
                        type: "select",
                        catalog: "staff",
                      },
                    ]}
                    submit="Assign reviewer"
                  />
                </Panel>
                {data.submission.status === "approved" && (
                  <Action
                    action="publish_submission"
                    input={{ submissionId: id }}
                    confirm
                  >
                    <T>{"Publish approved submission"}</T></Action>
                )}
              </>
            )}
            {selected && (
              <Modal
                title={`Review: ${selected.name}`}
                onClose={() => setSelected(undefined)}
              >
                {selected.kind === 'package' && <PackageReview row={selected}/>}
                {["submitted", "under_review"].includes(
                  String(data.submission.status),
                ) && (
                  <Panel title="Section decision">
                    <CommandForm
                      action="review_section"
                      input={{
                        submissionId: id,
                        recordId: selected.id,
                        expectedRevision: selected.revision,
                      }}
                      fields={[
                        {
                          key: "status",
                          label: "Section decision",
                          type: "select",
                          options: [
                            "under_review",
                            ...(portal === "admin" ? ["approved"] : []),
                            "changes_requested",
                            "evidence_required",
                            "rejected",
                          ],
                        },
                        {
                          key: "comment",
                          label: "Comment / requested correction",
                          type: "textarea",
                        },
                        { key: "reason", label: "Review reason" },
                        {
                          key: "documentId",
                          label: "Supporting evidence",
                          type: "select",
                          catalog: "provider_documents",
                          catalogParams: {
                            organizationId: String(
                              data.submission.organization_id,
                            ),
                          },
                        },
                      ]}
                      submit="Save section decision"
                      onDone={() => setSelected(undefined)}
                    />
                  </Panel>
                )}
                <ResourceTable
                  resource="provider_section_reviews"
                  params={{ recordId: String(selected.id) }}
                  title="Section decision history"
                  columns={[
                    { key: "revision", label: "Revision" },
                    {
                      key: "status",
                      label: "Decision",
                      render: (row) => <Status value={row.status} />,
                    },
                    { key: "comment", label: "Comment" },
                    { key: "reason", label: "Reason" },
                    {
                      key: "created_at",
                      label: "Reviewed",
                      render: (row) => date(row.created_at),
                    },
                  ]}
                />
                <Documents
                  organizationId={String(data.submission.organization_id)}
                />
                <ReferenceClaims key={`${selected.id}:${selected.revision}`} row={selected} submissionId={id} onSectionApproved={()=>setSelected(undefined)}/>
                <ResourceTable
                  resource="provider_revisions"
                  params={{ recordId: String(selected.id) }}
                  title="Previous versions"
                  columns={[
                    { key: "revision", label: "Revision" },
                    { key: "name", label: "Name" },
                    {
                      key: "data",
                      label: "Snapshot",
                      render: (row) => (
                        <details>
                          <summary><T>{"View saved fields"}</T></summary>
                          <dl className="portal-facts">
                            {Object.entries(row.data ?? {}).map(
                              ([key, value]) => (
                                <div key={key}>
                                  <dt>{label(key)}</dt>
                                  <dd>
                                    {Array.isArray(value)
                                      ? value.join(", ")
                                      : String(value ?? "Not provided")}
                                  </dd>
                                </div>
                              ),
                            )}
                          </dl>
                        </details>
                      ),
                    },
                  ]}
                />
                <p>
                  <T>{"Publication approval and factual verification are separate decisions. Mark a field verified only after checking current authoritative evidence."}</T></p>
                <CommandForm
                  action="review_field"
                  input={{ submissionId: id, recordId: selected.id }}
                  fields={[
                    {
                      key: "field",
                      label: "Field name",
                      type: "select",
                      options: ["name", ...Object.keys(selected.data ?? {})],
                    },
                    {
                      key: "status",
                      label: "Evidence status",
                      type: "select",
                      options: [
                        "approved",
                        "verified",
                        "needs_confirmation",
                        "conflicting",
                        "rejected",
                        "stale",
                        "not_applicable",
                      ],
                    },
                    {
                      key: "evidence",
                      label: "Evidence / reason",
                      type: "textarea",
                    },
                    {
                      key: "sourceUrl",
                      label: "Authoritative HTTPS source",
                      type: "url",
                    },
                    {
                      key: "documentId",
                      label: "Approved supporting document",
                      type: "select",
                      catalog: "provider_documents",
                      catalogParams: {
                        organizationId: String(data.submission.organization_id),
                        status: "approved",
                      },
                    },
                    {
                      key: "expiresOn",
                      label: "Evidence expiry",
                      type: "date",
                    },
                  ]}
                  submit="Record field review"
                />
                <ResourceTable
                  resource="provider_field_reviews"
                  params={{ recordId: String(selected.id) }}
                  title="Review history"
                  columns={verificationColumns}
                />
              </Modal>
            )}
          </>
        )
      )}
    </Modal>
  );
}
const verificationColumns = [
  { key: "field", label: "Field" },
  {
    key: "status",
    label: "Status",
    render: (row: Row) => <Status value={row.status} />,
  },
  { key: "evidence", label: "Evidence" },
  {
    key: "source_url",
    label: "Source",
    render: (row: Row) =>
      row.source_url ? (
        <a href={String(row.source_url)} target="_blank" rel="noreferrer">
          <T>{"Authoritative source"}</T></a>
      ) : (
        "Document / reviewer evidence"
      ),
  },
  {
    key: "created_at",
    label: "Checked",
    render: (row: Row) => date(row.created_at),
  },
];
export function Verification({ organizationId }: { organizationId?: string }) {
  const { portal, context, token, refresh } = usePortal();
  const [selected, setSelected] = useState<Row>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parsed = selected
    ? verificationReportSchema.safeParse({
        ...(selected.report as Record<string, unknown>),
        ownerId: context.userId,
        conversationId: selected.id,
      })
    : undefined;
  return (
    <>
      <Panel title="Evidence and verification">
        <p>
          <T>{"Field reviews are recorded against an immutable revision. “Approved” means reviewed for publication. “Verified” requires checked evidence. Synthetic records remain synthetic."}</T></p>
        {organizationId && ["admin", "support"].includes(portal) && (
          <button
            className="portal-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await fetch(
                  `/api/portals/verification?portal=${portal}`,
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ organizationId }),
                  },
                );
                const value = await result.json();
                if (!result.ok) throw new Error(value.error);
                refresh();
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Unable to run verification.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <T>{busy ? "Checking factual evidence…" : "Run Provider Verification"}</T>
          </button>
        )}
        {error && (
          <p className="portal-field-error" role="alert">
            {error}
          </p>
        )}
      </Panel>
      <ResourceTable
        resource="provider_field_reviews"
        title="Field verification history"
        params={organizationId ? { organizationId } : {}}
        columns={verificationColumns}
      />
      <ResourceTable
        resource="portal_verification_checks"
        title="Provider Verification checks"
        params={organizationId ? { organizationId } : {}}
        columns={[
          {
            key: "created_at",
            label: "Checked",
            render: (row) => date(row.created_at),
          },
          {
            key: "report",
            label: "Result",
            render: (row) =>
              label(
                String(
                  (row.report as Record<string, unknown>)?.status ??
                    "Recorded check",
                ),
              ),
          },
        ]}
        onOpen={setSelected}
      />
      {selected && (
        <Modal
          title="Provider Verification evidence"
          onClose={() => setSelected(undefined)}
        >
          {parsed?.success ? (
            <VerificationResults
              result={{
                report: parsed.data,
                history: [],
                message: "Saved organization-scoped factual check.",
                reused: true,
              }}
              disabled
            />
          ) : (
            <p><T>{"This check is unavailable in the current report format."}</T></p>
          )}
        </Modal>
      )}
    </>
  );
}
export function Documents({ organizationId }: { organizationId?: string }) {
  const { portal, token, refresh, notice } = usePortal();
  const [upload, setUpload] = useState(false);
  const [selected, setSelected] = useState<Row>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const association = useForm<{
    name: string;
    values: Record<string, string | boolean | string[]>;
  }>({ defaultValues: { name: "", values: { recordId: "" } } });
  const download = async (row: Row) => {
    setBusy(true);
    try {
      const result = await fetch(
        `/api/portals/documents?portal=${portal}&id=${row.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!result.ok) throw new Error((await result.json()).error);
      const blob = await result.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = String(row.name);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to download document.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ResourceTable
        resource="provider_documents"
        title="Private document center"
        params={organizationId ? { organizationId } : {}}
        columns={[
          { key: "name", label: "Document" },
          {
            key: "document_type",
            label: "Type",
            render: (row) => label(String(row.document_type)),
          },
          {
            key: "status",
            label: "Status",
            render: (row) => <Status value={row.status} />,
          },
          {
            key: "expires_on",
            label: "Expiry",
            render: (row) =>
              row.expires_on ? date(row.expires_on) : "Not provided",
          },
          {
            key: "created_at",
            label: "Uploaded",
            render: (row) => date(row.created_at),
          },
        ]}
        onOpen={setSelected}
        extra={
          organizationId &&
          (portal === "provider" || portal === "admin") && (
            <button className="portal-button" onClick={() => setUpload(true)}>
              <T>{"Upload document"}</T></button>
          )
        }
      />
      {upload && organizationId && (
        <Modal title="Upload private evidence" onClose={() => setUpload(false)}>
          <p>
            <T>{"PDF, JPG or PNG, maximum 3 MB. Documents are private to your organization and authorized reviewers."}</T></p>
          <form
            className="portal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(e.currentTarget);
              form.set("organizationId", organizationId);
              const recordId = association.getValues("values.recordId");
              if (recordId) form.set("recordId", String(recordId));
              try {
                const result = await fetch(
                  `/api/portals/documents?portal=${portal}`,
                  {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: form,
                  },
                );
                if (!result.ok) throw new Error((await result.json()).error);
                refresh();
                notice("Document uploaded.");
                setUpload(false);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Unable to upload file.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <FieldControl
              field={{
                key: "recordId",
                label: "Associated listing section",
                type: "select",
                catalog: "provider_records",
                catalogParams: { organizationId },
              }}
              register={association.register}
            />
            <label className="portal-field">
              <span><T>{"Document type"}</T></span>
              <select name="documentType" required>
                {[
                  "license",
                  "accreditation",
                  "certificate",
                  "package",
                  "official_information",
                  "supporting_evidence",
                  "profile_image",
                ].map((type) => (
                  <option key={type} value={type}>
                    {label(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="portal-field">
              <span><T>{"File"}</T></span>
              <input
                type="file"
                name="file"
                accept="application/pdf,image/jpeg,image/png"
                required
              />
            </label>
            <label className="portal-field">
              <span><T>{"Expiry (if applicable)"}</T></span>
              <input type="date" name="expiresOn" />
            </label>
            {error && (
              <p role="alert" className="portal-field-error">
                {error}
              </p>
            )}
            <button className="portal-button" disabled={busy}>
              <T>{busy ? "Uploading…" : "Upload securely"}</T>
            </button>
          </form>
        </Modal>
      )}
      {selected && (
        <Modal
          title={String(selected.name)}
          onClose={() => {
            setSelected(undefined);
            setError("");
          }}
        >
          <div className="portal-actions">
            <Status value={selected.status} />
            <button
              className="portal-button secondary"
              disabled={busy}
              onClick={() => void download(selected)}
            >
              <T>{"Download private file"}</T></button>
          </div>
          <p>
            <T>{"Uploaded"}</T>{' '}{date(selected.created_at)} ·{" "}
            <LocalNumber value={Number(selected.size_bytes)}/> <T>{"bytes"}</T></p>
          <p>{String(selected.review_message ?? "")}</p>
          {organizationId &&
            portal === "provider" &&
            ["rejected", "expired"].includes(String(selected.status)) && (
              <div className="portal-review-feedback">
                <p>
                  <T>{"Upload a replacement for the same section, then update its supporting document selection and resubmit the draft. The earlier document and review stay in history."}</T></p>
                <button
                  className="portal-button"
                  onClick={() => {
                    association.setValue(
                      "values.recordId",
                      String(selected.record_id ?? ""),
                    );
                    setSelected(undefined);
                    setUpload(true);
                  }}
                >
                  <T>{"Upload replacement evidence"}</T></button>
              </div>
            )}
          {error && (
            <p role="alert" className="portal-field-error">
              {error}
            </p>
          )}
          {["admin", "support"].includes(portal) && (
            <Panel title="Document review">
              <CommandForm
                action="review_document"
                input={{ documentId: selected.id }}
                fields={[
                  {
                    key: "status",
                    label: "Review status",
                    type: "select",
                    options: [
                      "under_review",
                      "approved",
                      "rejected",
                      "expired",
                      "archived",
                    ],
                  },
                  {
                    key: "message",
                    label: "Review notes / reason",
                    type: "textarea",
                  },
                ]}
                submit="Record document review"
                onDone={setSelected}
              />
            </Panel>
          )}
        </Modal>
      )}
    </>
  );
}
