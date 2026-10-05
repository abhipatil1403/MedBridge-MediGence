"use client";
import { LocalNumber } from '@/components/experience/translation';
import { packagePrice } from '@/lib/catalog/pricing';

import { Localized } from '@/components/experience/localized';

import { T } from '@/components/experience/translation';
import Link from "next/link";
import { useState } from "react";
import { label, sectionKind, type Row } from "@/lib/portals/config";
import {
  Action,
  activityColumns,
  date,
  Empty,
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
import { Cases, CaseDetail } from "./cases";
import { RecordWorkspace } from "./record-form";
import {
  Documents,
  Submissions,
  SubmissionDetail,
  Verification,
} from "./reviews";

export function ProviderContent({ section }: { section: string }) {
  const { organizationId } = usePortal();
  if (sectionKind[section])
    return <RecordWorkspace kind={sectionKind[section]} />;
  if (section === "onboarding") return <Onboarding />;
  if (section === "documents")
    return <Documents organizationId={organizationId} />;
  if (section === "submissions")
    return <Submissions organizationId={organizationId} />;
  if (section === "verification")
    return <Verification organizationId={organizationId} />;
  if (section === "preview") return <Preview />;
  if (section === "team") return <Team />;
  if (section === "messages")
    return (
      <>
        <OrganizationMessages />
        <Cases mode="messages" />
      </>
    );
  if (section === "notifications") return <Notifications />;
  if (section === "activity")
    return (
      <ResourceTable
        resource="audit_events"
        title="Organization activity"
        params={{ organizationId }}
        columns={activityColumns}
      />
    );
  if (section === "settings") return <Preferences provider />;
  return <Dashboard />;
}
export function Dashboard() {
  const { portal, organizationId } = usePortal();
  const { data, error, loading } = useResource<Record<string, unknown>>(
    portal === "admin" ? "analytics" : "stats",
    organizationId ? { organizationId } : {},
  );
  return (
    <>
      {error ? (
        <ErrorPanel message={error} />
      ) : loading ? (
        <Loading />
      ) : (
        <div className="portal-metrics">
          {Object.entries(data ?? {})
            .filter(([, value]) => typeof value === "number")
            .map(([key, value]) => (
              <article key={key}>
                <span>{label(key.replace(/([A-Z])/g, " $1"))}</span>
                <strong><LocalNumber value={Number(value)}/></strong>
                <small><T>{"From your authorized database records"}</T></small>
              </article>
            ))}
        </div>
      )}
      {portal === "provider" ? (
        <>
          <Onboarding compact />
          <ListingAttention />
          <ResourceTable
            resource="provider_submissions"
            title="Recent submissions"
            params={{ organizationId }}
            columns={[
              {
                key: "status",
                label: "Status",
                render: (row) => <Status value={row.status} />,
              },
              { key: "review_message", label: "Review feedback" },
              {
                key: "submitted_at",
                label: "Submitted",
                render: (row) => date(row.submitted_at),
              },
            ]}
          />
          <ResourceTable
            resource="audit_events"
            title="Recent activity"
            params={{ organizationId }}
            columns={activityColumns}
          />
        </>
      ) : portal === "admin" ? (
        <>
          <Panel title="Review priorities">
            <div className="portal-actions">
              <Link className="portal-button" href="/admin/applications">
                <T>{"Review applications"}</T></Link>
              <Link className="portal-button secondary" href="/admin/documents">
                <T>{"Review evidence"}</T></Link>
              <Link
                className="portal-button secondary"
                href="/admin/verification"
              >
                <T>{"Check verification issues"}</T></Link>
            </div>
          </Panel>
          <Submissions />
          <ResourceTable
            resource="audit_events"
            title="Recent activity"
            columns={activityColumns}
          />
        </>
      ) : (
        <>
          <Cases mode="mine" />
          <ResourceTable
            resource="audit_events"
            title="Recent activity"
            columns={activityColumns}
          />
        </>
      )}
    </>
  );
}
const steps = [
  ["Organization", "profile"],
  ["Contact", "profile"],
  ["Locations", "locations"],
  ["Specialties", "specialties"],
  ["Treatments", "treatments"],
  ["Facilities", "facilities"],
  ["Doctors", "doctors"],
  ["Accreditations", "accreditations"],
  ["International services", "international"],
  ["Packages", "packages"],
  ["Documents", "documents"],
  ["Review", "preview"],
  ["Submit", "submissions"],
] as const;
type ListingStatus = {
  required: string[];
  missing: string[];
  completed: number;
  total: number;
  profileStatus: string;
  publishedRevision: number | null;
  submissionStatus: string | null;
  lastSubmitted: string | null;
  lastReviewed: string | null;
  reviewComment: string | null;
  pendingDocuments: number;
  documentsNeedingReplacement: number;
  packagesAwaitingReview: number;
  requestedChanges: {
    id: string;
    name: string;
    kind: string;
    status: string;
    comment: string;
    reason: string;
    revision: number;
    currentRevision: number;
  }[];
};
function ListingAttention() {
  const { organizationId } = usePortal();
  const { data, error, loading } = useResource<ListingStatus>(
    "listing_status",
    { organizationId },
  );
  const checks = useResource<{ rows: Row[] }>("portal_verification_checks", {
    organizationId,
    size: "1",
  });
  const verificationStatus = (
    checks.data?.rows[0]?.report as { status?: string } | undefined
  )?.status;
  return (
    <Panel title="Your next steps">
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorPanel message={error} />
      ) : (
        data && (
          <>
            <dl className="portal-facts">
              <div>
                <dt><T>{"Submission"}</T></dt>
                <dd>
                  {data.submissionStatus ? (
                    <Status value={data.submissionStatus} />
                  ) : (
                    "Not submitted"
                  )}
                </dd>
              </div>
              <div>
                <dt><T>{"Publication"}</T></dt>
                <dd>
                  {data.publishedRevision
                    ? `Revision ${data.publishedRevision} is published`
                    : "Not published"}
                </dd>
              </div>
              <div>
                <dt><T>{"Last submitted"}</T></dt>
                <dd>{date(data.lastSubmitted)}</dd>
              </div>
              <div>
                <dt><T>{"Last section review"}</T></dt>
                <dd>{date(data.lastReviewed)}</dd>
              </div>
              <div>
                <dt><T>{"Latest factual verification check"}</T></dt>
                <dd>
                  {checks.loading ? (
                    "Loading check history…"
                  ) : checks.error ? (
                    "Check history unavailable"
                  ) : verificationStatus ? (
                    <Status value={verificationStatus} />
                  ) : (
                    "No factual verification check recorded"
                  )}
                  {" · "}
                  <Link href="/provider/verification"><T>{"Review evidence"}</T></Link>
                </dd>
              </div>
            </dl>
            {data.reviewComment && (
              <div className="portal-review-feedback">
                <h3><T>{"Admin feedback"}</T></h3>
                <p>{data.reviewComment}</p>
              </div>
            )}
            {data.requestedChanges.map((review) => (
              <article key={review.id} className="portal-review-feedback">
                <h3>{review.name}</h3>
                <Status value={review.status} />
                <p>{review.comment}</p>
                {review.reason && <p>{review.reason}</p>}
                <Link
                  href={`/provider/${Object.keys(sectionKind).find((section) => sectionKind[section] === review.kind) ?? "submissions"}`}
                >
                  <T>{"Continue this section"}</T></Link>
                <p className="portal-muted">
                  <T>{"Reviewed revision"}</T>{' '}{review.revision}
                  <T>{review.currentRevision > review.revision
                    ? " · draft revised; submit it for another review"
                    : ""}</T>
                </p>
              </article>
            ))}
            <div className="portal-actions">
              <Link href="/provider/documents">
                {data.pendingDocuments} <T>{"documents awaiting review ·"}</T>{" "}
                {data.documentsNeedingReplacement} <T>{"need replacement"}</T></Link>
              <Link href="/provider/packages">
                {data.packagesAwaitingReview} <T>{"packages awaiting review"}</T></Link>
              <Link className="portal-button" href="/provider/submissions">
                <T>{"Open submissions"}</T></Link>
            </div>
          </>
        )
      )}
    </Panel>
  );
}
function Onboarding({ compact = false }: { compact?: boolean }) {
  const { portal, organizationId } = usePortal();
  const { data, error, loading } = useResource<{ rows: Row[] }>(
    "provider_records",
    { organizationId, size: "200" },
  );
  const { data: docs } = useResource<{ rows: Row[]; total: number }>(
    "provider_documents",
    { organizationId, size: "1" },
  );
  const profile = data?.rows.find((row) => row.kind === "organization");
  const {
    data: listing,
    error: listingError,
    loading: listingLoading,
  } = useResource<ListingStatus>("listing_status", { organizationId });
  const completed = listing?.completed ?? 0;
  const total = listing?.total ?? 1;
  const complete = (name: string) =>
    name === "Organization"
      ? Boolean(profile?.data?.description && profile?.data?.cityId)
      : name === "Contact"
        ? Boolean(profile?.data?.email && profile?.data?.phone)
        : name === "Documents"
          ? Boolean(docs?.total)
          : name === "Review"
            ? Boolean(profile)
            : name === "Submit"
              ? data?.rows.some((row) =>
                  [
                    "submitted",
                    "under_review",
                    "approved",
                    "published",
                  ].includes(String(row.status)),
                )
              : data?.rows.some(
                  (row) =>
                    row.kind ===
                    sectionKind[
                      steps.find((step) => step[0] === name)?.[1] ?? ""
                    ],
                );
  return (
    <Panel title="Organization onboarding">
      {error || listingError ? (
        <ErrorPanel message={error || listingError} />
      ) : loading || listingLoading ? (
        <Loading />
      ) : (
        <>
          <div className="portal-progress-heading">
            <strong>
              {Math.round((completed / total) * 100)}<T>{"% required profile fields complete"}</T></strong>
            <span>
              {profile ? (
                <Status value={profile.status} />
              ) : (
                <Status value="draft" />
              )}
            </span>
          </div>
          <Localized as="progress"
            value={completed}
            max={total}
            aria-label="Required profile completeness"
          />
          {listing?.missing.length ? (
            <p className="portal-review-feedback">
              <T>{"Required:"}</T>{" "}
              {listing.missing
                .map((key) => label(key.replace(/([A-Z])/g, " $1")))
                .join(", ")}
              . <Link href="/provider/profile"><T>{"Complete profile"}</T></Link>
            </p>
          ) : (
            <p className="portal-muted">
              <T>{"All required profile fields are supplied."}</T></p>
          )}
          <p className="portal-muted">
            <T>{"Optional sections can be added later. Each saved draft persists when you leave and return."}</T></p>
          <ol className={`portal-onboarding ${compact ? "compact" : ""}`}>
            {steps.map(([name, section], index) => (
              <li key={name} className={complete(name) ? "is-complete" : ""}>
                <Link href={`/${portal}/${section}`}>
                  <span>{complete(name) ? "✓" : index + 1}</span>
                  <strong>{name}</strong>
                  <small>
                    <T>{complete(name) ? "Saved / completed" : "Continue"}</T>
                  </small>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </Panel>
  );
}
function Preview() {
  const { organizationId, request } = usePortal();
  const [mode, setMode] = useState("draft");
  const [published, setPublished] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const {
    data,
    error,
    loading: draftLoading,
  } = useResource<{ rows: Row[] }>("provider_records", {
    organizationId,
    size: "200",
  });
  const choose = async (value: string) => {
    setMode(value);
    if (value === "published") {
      setLoading(true);
      setPreviewError("");
      try {
        const snapshot = await request<{ rows: Row[] }>("published_preview", {
          organizationId,
        });
        setPublished(snapshot.rows);
      } catch (err) {
        setPreviewError(
          err instanceof Error
            ? err.message
            : "Unable to load the published snapshot.",
        );
      } finally {
        setLoading(false);
      }
    }
  };
  const rows = mode === "published" ? published : (data?.rows ?? []);
  const profile = rows.find((row) => row.kind === "organization");
  return (
    <Panel title="How your organization appears on MedBridge">
      <div className="portal-actions">
        <button
          className={`portal-button ${mode === "draft" ? "" : "secondary"}`}
          onClick={() => void choose("draft")}
        >
          <T>{"Draft preview"}</T></button>
        <button
          className={`portal-button ${mode === "published" ? "" : "secondary"}`}
          onClick={() => void choose("published")}
        >
          <T>{"Published snapshot"}</T></button>
      </div>
      {error || previewError ? (
        <ErrorPanel message={error || previewError} />
      ) : loading || (mode === "draft" && draftLoading) ? (
        <Loading />
      ) : !profile ? (
        <Empty
          title={mode === "published"
              ? "No published profile yet"
              : "Save your organization profile to preview it"}
        />
      ) : (
        <div className="portal-profile-preview">
          <p className="portal-eyebrow">
            <T>{mode === "published"
              ? "PUBLISHED SNAPSHOT"
              : "PRIVATE DRAFT PREVIEW · NOT PUBLIC"}</T>
          </p>
          <h2>{String(profile.name)}</h2>
          <p>{String(profile.data?.description ?? "Overview not provided.")}</p>
          {rows
            .filter((row) => row.kind !== "organization")
            .map((row) => (
              <article key={row.id}>
                <header>
                  <h3>{String(row.name)}</h3>
                  <Status
                    value={mode === "published" ? "published" : row.status}
                  />
                </header>
                <p>{label(String(row.kind))}</p>
                <p>
                  {String(
                    row.data?.description ??
                      row.data?.biography ??
                      row.data?.body ??
                      "",
                  )}
                </p>
                {row.kind === "package" && (
                  <>
                    <strong>
                      {packagePrice({listedPrice:typeof row.data?.price==='number'?row.data.price:undefined,listedPriceMax:typeof row.data?.priceMax==='number'?row.data.priceMax:undefined,currency:typeof row.data?.currency==='string'?row.data.currency:undefined,priceType:String(row.data?.priceType??'estimate')})} ·{" "}
                      {row.data?.durationDays?<>{String(row.data.durationDays)} <T>{'days'}</T></>:<T>{'Duration not provided'}</T>}</strong>
                    <h4><T>{"Inclusions"}</T></h4>
                    <ul>
                      {Array.isArray(row.data?.inclusions) &&
                        (row.data.inclusions as string[]).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                    </ul>
                    <h4><T>{"Exclusions"}</T></h4>
                    <ul>
                      {Array.isArray(row.data?.exclusions) &&
                        (row.data.exclusions as string[]).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                    </ul>
                  </>
                )}
              </article>
            ))}
        </div>
      )}
    </Panel>
  );
}
export function OrganizationMessages() {
  const { organizationId } = usePortal();
  return (
    <>
      <ResourceTable
        resource="organization_messages"
        title="Provider ↔ platform messages"
        params={{ organizationId }}
        columns={[
          { key: "body", label: "Message" },
          {
            key: "created_at",
            label: "Sent",
            render: (row) => date(row.created_at),
          },
        ]}
      />
      <Panel title="Message the platform team">
        <CommandForm
          action="organization_message"
          input={{ organizationId }}
          fields={[{ key: "body", label: "Message", type: "textarea" }]}
          submit="Send message"
        />
      </Panel>
    </>
  );
}
function Team() {
  const { organizationId, context } = usePortal();
  const [selected, setSelected] = useState<Row>();
  const [inviteLink, setInviteLink] = useState("");
  const manage =
    context.role === "admin" ||
    context.role === "super_admin" ||
    context.organizations.some(
      (org) => org.id === organizationId && org.role === "provider_admin",
    );
  return (
    <>
      <ResourceTable
        resource="team"
        title="Organization team"
        params={{ organizationId }}
        columns={[
          {
            key: "name",
            label: "Name",
            render: (row) => String(row.name ?? row.email),
          },
          { key: "email", label: "Email" },
          {
            key: "role",
            label: "Role",
            render: (row) => label(String(row.role)),
          },
          {
            key: "active",
            label: "Status",
            render: (row) => (
              <Status value={row.active ? "active" : "inactive"} />
            ),
          },
          {
            key: "last_active_at",
            label: "Last active",
            render: (row) => date(row.last_active_at),
          },
        ]}
        onOpen={manage ? setSelected : undefined}
      />
      {manage && (
        <>
          <Panel title="Invite a team member">
            <p>
              <T>{"Create an invitation, then share its link with the intended teammate. They must sign in using the matching email address."}</T></p>
            <CommandForm
              action="invite_member"
              input={{ organizationId }}
              fields={[
                { key: "email", label: "Teammate email", type: "email" },
                {
                  key: "role",
                  label: "Role",
                  type: "select",
                  options: ["provider_admin", "provider_editor"],
                },
              ]}
              initial={{ role: "provider_editor" }}
              submit="Create invitation"
              onDone={(row) =>
                setInviteLink(
                  `${window.location.origin}/provider/team?invite=${row.id}`,
                )
              }
            />
            {inviteLink && (
              <label className="portal-field">
                <span><T>{"Share this invitation link"}</T></span>
                <input
                  readOnly
                  value={inviteLink}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
          </Panel>
          <ResourceTable
            resource="organization_invites"
            title="Invitations"
            params={{ organizationId }}
            columns={[
              { key: "email", label: "Email" },
              { key: "role", label: "Role" },
              {
                key: "expires_at",
                label: "Expires",
                render: (row) => date(row.expires_at),
              },
              {
                key: "accepted_by",
                label: "State",
                render: (row) =>
                  row.revoked_at
                    ? "Revoked"
                    : row.accepted_by
                      ? "Accepted"
                      : "Pending",
              },
              {
                key: "action",
                label: "Action",
                render: (row) =>
                  !row.revoked_at &&
                  !row.accepted_by && (
                    <Action
                      action="revoke_invite"
                      input={{ inviteId: row.id }}
                      confirm
                      danger
                    >
                      <T>{"Revoke"}</T></Action>
                  ),
              },
            ]}
          />
        </>
      )}
      {selected && (
        <Modal
          title="Manage team member"
          onClose={() => setSelected(undefined)}
        >
          <p>{String(selected.email)}</p>
          <CommandForm
            action="update_member"
            input={{ organizationId, userId: selected.id }}
            fields={[
              {
                key: "role",
                label: "Role",
                type: "select",
                options: ["provider_admin", "provider_editor"],
              },
              { key: "active", label: "Active team access", type: "checkbox" },
            ]}
            initial={{ role: selected.role, active: selected.active }}
            onDone={() => setSelected(undefined)}
          />
        </Modal>
      )}
    </>
  );
}
export function Notifications() {
  const [selected, setSelected] = useState<Row>();
  return (
    <>
      <ResourceTable
        resource="portal_notifications"
        title="Notifications"
        columns={[
          { key: "title", label: "Notification" },
          { key: "body", label: "Details" },
          {
            key: "created_at",
            label: "Received",
            render: (row) => date(row.created_at),
          },
          {
            key: "read_at",
            label: "State",
            render: (row) => (row.read_at ? "Read" : "Unread"),
          },
          {
            key: "action",
            label: "Action",
            render: (row) => (
              <Action
                action="mark_notification"
                input={{ notificationId: row.id, read: !row.read_at }}
              >
                <T>{row.read_at ? "Mark unread" : "Mark read"}</T>
              </Action>
            ),
          },
        ]}
        onOpen={setSelected}
      />
      {selected &&
        (selected.resource_type === "support_case" ? (
          <CaseDetail
            id={String(selected.resource_id)}
            onClose={() => setSelected(undefined)}
          />
        ) : selected.resource_type === "submission" ? (
          <SubmissionDetail
            id={String(selected.resource_id)}
            onClose={() => setSelected(undefined)}
          />
        ) : (
          <Modal
            title={String(selected.title)}
            onClose={() => setSelected(undefined)}
          >
            <p>{String(selected.body ?? "")}</p>
            <p className="portal-muted">{date(selected.created_at)}</p>
            <Action
              action="mark_notification"
              input={{ notificationId: selected.id, read: !selected.read_at }}
              onDone={() => setSelected(undefined)}
            >
              <T>{selected.read_at ? "Mark unread" : "Mark read"}</T>
            </Action>
          </Modal>
        ))}
    </>
  );
}
export function Preferences({ provider = false }: { provider?: boolean }) {
  const { context, portal } = usePortal();
  const { data } = useResource<{ rows: Row[] }>("portal_accounts", {
    id: context.userId,
  });
  const account = data?.rows[0];
  const prefs = account?.notification_preferences as
    | Record<string, unknown>
    | undefined;
  return (
    <>
      <Panel title="Notifications">
        <CommandForm
          key={JSON.stringify(prefs)}
          action="save_preferences"
          fields={[
            {
              key: "inApp",
              label: "Receive in-app operational notifications",
              type: "checkbox",
            },
          ]}
          initial={{ inApp: prefs?.in_app !== false }}
        />
      </Panel>
      <Panel title="Account & security">
        <p>
          <T>{"Signed in as"}</T><strong>{context.email}</strong>.
        </p>
        <p>
          <T>{"Sign-in uses the existing MedBridge email confirmation flow. Team permissions and staff roles are controlled by the database."}</T></p>
        {provider && portal === "provider" && (
          <div className="portal-actions">
            <Link className="portal-button secondary" href="/provider/profile">
              <T>{"Organization settings"}</T></Link>
            <Link className="portal-button secondary" href="/provider/team">
              <T>{"Team access"}</T></Link>
          </div>
        )}
      </Panel>
    </>
  );
}
export function CreateOrganization({
  onDone,
}: {
  onDone?: (row: Row) => void;
}) {
  return (
    <Panel title="Create your organization">
      <p>
        <T>{"Create a private workspace for a hospital, clinic or healthcare organization you represent."}</T></p>
      <CommandForm
        action="create_organization"
        fields={[
          { key: "name", label: "Organization name" },
          { key: "legalName", label: "Legal name" },
          {
            key: "providerType",
            label: "Provider type",
            type: "select",
            options: ["hospital", "clinic", "healthcare_organization"],
          },
          {
            key: "sourceKind",
            label: "Record provenance",
            type: "select",
            options: ["first_party", "synthetic"],
          },
        ]}
        initial={{ providerType: "hospital", sourceKind: "first_party" }}
        submit="Create organization"
        onDone={onDone}
      />
    </Panel>
  );
}
