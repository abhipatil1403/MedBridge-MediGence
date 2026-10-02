"use client";
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
                <strong>{Number(value).toLocaleString()}</strong>
                <small>From your authorized database records</small>
              </article>
            ))}
        </div>
      )}
      {portal === "provider" ? (
        <>
          <Onboarding compact />
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
  const required = ["description", "cityId", "email", "phone"];
  const completed =
    (profile?.name ? 1 : 0) +
    required.filter((key) => Boolean(profile?.data?.[key])).length;
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
      {error ? (
        <ErrorPanel message={error} />
      ) : loading ? (
        <Loading />
      ) : (
        <>
          <div className="portal-progress-heading">
            <strong>
              {Math.round((completed / 5) * 100)}% required profile fields
              complete
            </strong>
            <span>
              {profile ? (
                <Status value={profile.status} />
              ) : (
                <Status value="draft" />
              )}
            </span>
          </div>
          <progress
            value={completed}
            max={5}
            aria-label="Required profile completeness"
          />
          <p className="portal-muted">
            Optional sections can be added later. Each saved draft persists when
            you leave and return.
          </p>
          <ol className={`portal-onboarding ${compact ? "compact" : ""}`}>
            {steps.map(([name, section], index) => (
              <li key={name} className={complete(name) ? "is-complete" : ""}>
                <Link href={`/${portal}/${section}`}>
                  <span>{complete(name) ? "✓" : index + 1}</span>
                  <strong>{name}</strong>
                  <small>
                    {complete(name) ? "Saved / completed" : "Continue"}
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
  const { data, error } = useResource<{ rows: Row[] }>("provider_records", {
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
          Draft preview
        </button>
        <button
          className={`portal-button ${mode === "published" ? "" : "secondary"}`}
          onClick={() => void choose("published")}
        >
          Published snapshot
        </button>
      </div>
      {error || previewError ? (
        <ErrorPanel message={error || previewError} />
      ) : loading ? (
        <Loading />
      ) : !profile ? (
        <Empty
          title={
            mode === "published"
              ? "No published profile yet"
              : "Save your organization profile to preview it"
          }
        />
      ) : (
        <div className="portal-profile-preview">
          <p className="portal-eyebrow">
            {mode === "published"
              ? "PUBLISHED SNAPSHOT"
              : "PRIVATE DRAFT PREVIEW · NOT PUBLIC"}
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
                      {String(row.data?.currency ?? "")}{" "}
                      {Number(row.data?.price ?? 0).toLocaleString()} ·{" "}
                      {String(row.data?.durationDays ?? "—")} days
                    </strong>
                    <h4>Inclusions</h4>
                    <ul>
                      {Array.isArray(row.data?.inclusions) &&
                        (row.data.inclusions as string[]).map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                    </ul>
                    <h4>Exclusions</h4>
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
              Create an invitation, then share its link with the intended
              teammate. They must sign in using the matching email address.
            </p>
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
                <span>Share this invitation link</span>
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
                      Revoke
                    </Action>
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
                {row.read_at ? "Mark unread" : "Mark read"}
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
              {selected.read_at ? "Mark unread" : "Mark read"}
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
          Signed in as <strong>{context.email}</strong>.
        </p>
        <p>
          Sign-in uses the existing MedBridge email confirmation flow. Team
          permissions and staff roles are controlled by the database.
        </p>
        {provider && portal === "provider" && (
          <div className="portal-actions">
            <Link className="portal-button secondary" href="/provider/profile">
              Organization settings
            </Link>
            <Link className="portal-button secondary" href="/provider/team">
              Team access
            </Link>
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
        Create a private workspace for a hospital, clinic or healthcare
        organization you represent.
      </p>
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
