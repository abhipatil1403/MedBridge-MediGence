"use client";
import { useState } from "react";
import {
  type Field,
  type Row,
  label,
  providerSections,
} from "@/lib/portals/config";
import {
  Action,
  activityColumns,
  date,
  Empty,
  ErrorPanel,
  Loading,
  Modal,
  Panel,
  PortalStateContext,
  ResourceTable,
  Status,
  usePortal,
  useResource,
} from "./core";
import { CommandForm } from "./command-form";
import { Cases, Tasks } from "./cases";
import {
  CreateOrganization,
  Dashboard,
  Notifications,
  Preferences,
  ProviderContent,
} from "./provider";
import { Documents, Submissions, Verification } from "./reviews";
import { FieldControl } from "./record-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { publicUrl } from "@/lib/portals/public-url";
const catalogs = [
  "hospitals",
  "doctors",
  "treatments",
  "packages",
  "specialties",
  "countries",
  "cities",
  "services",
];
export function AdminContent({ section }: { section: string }) {
  if (catalogs.includes(section))
    return (
      <CatalogWorkspace
        entity={section === "services" ? "healthcare_services" : section}
      />
    );
  if (section === "users") return <Users admin />;
  if (section === "providers" || section === "messages") return <Providers />;
  if (section === "applications" || section === "submissions")
    return <Submissions />;
  if (section === "verification") return <Verification />;
  if (section === "documents") return <Documents />;
  if (section === "cases") return <Cases />;
  if (section === "audit") return <Audit />;
  if (section === "notifications") return <Notifications />;
  if (section === "settings") return <PlatformSettings />;
  if (section === "analytics") return <Analytics />;
  return <Dashboard />;
}
export function SupportContent({ section }: { section: string }) {
  if (["cases", "all-cases"].includes(section)) return <Cases />;
  if (section === "queue") return <Cases mode="mine" />;
  if (section === "escalated") return <Cases mode="escalated" />;
  if (section === "documents")
    return (
      <>
        <Cases mode="documents" />
        <Documents />
      </>
    );
  if (section === "messages") return <Cases mode="messages" />;
  if (section === "users") return <Users />;
  if (section === "providers") return <Providers />;
  if (section === "tasks") return <Tasks />;
  if (section === "activity")
    return (
      <ResourceTable
        resource="audit_events"
        title="Authorized activity"
        columns={activityColumns}
      />
    );
  if (section === "notifications") return <Notifications />;
  if (section === "settings") return <Preferences />;
  if (section === "team") return <Workload />;
  return <Dashboard />;
}
export function Users({ admin = false }: { admin?: boolean }) {
  const [selected, setSelected] = useState<Row>();
  return (
    <>
      <ResourceTable
        resource="users"
        title={admin ? "Users and access" : "Authorized case users"}
        columns={[
          {
            key: "name",
            label: "Name",
            render: (row) => String(row.name ?? row.email),
          },
          { key: "email", label: "Email" },
          {
            key: "role",
            label: "Staff role",
            render: (row) =>
              row.role ? label(String(row.role)) : "Patient / provider",
          },
          {
            key: "active",
            label: "Account",
            render: (row) => (
              <Status value={row.active ? "active" : "inactive"} />
            ),
          },
        ]}
        onOpen={setSelected}
      />
      {selected && (
        <Modal
          title={String(selected.name ?? selected.email)}
          onClose={() => setSelected(undefined)}
        >
          <p>{String(selected.email)}</p>
          {admin ? (
            <>
              <Panel title="Staff role">
                <CommandForm
                  action="set_staff_role"
                  input={{ userId: selected.id }}
                  fields={[
                    {
                      key: "role",
                      label: "Role",
                      type: "select",
                      options: [
                        "support_agent",
                        "support_manager",
                        "admin",
                        "super_admin",
                      ],
                    },
                    {
                      key: "active",
                      label: "Active staff role",
                      type: "checkbox",
                    },
                  ]}
                  initial={{
                    role: selected.role ?? "support_agent",
                    active: true,
                  }}
                  submit="Update staff access"
                />
                <p className="portal-muted">
                  Only Super Admin can grant or change admin roles. Disable the
                  staff role to remove staff access while retaining their
                  patient account.
                </p>
              </Panel>
              <Action
                action="set_account_status"
                input={{ userId: selected.id, active: !selected.active }}
                confirm
                danger
              >
                {selected.active ? "Deactivate account" : "Reactivate account"}
              </Action>
            </>
          ) : (
            <Cases patientId={String(selected.id)} />
          )}
        </Modal>
      )}
    </>
  );
}
export function Providers() {
  const state = usePortal();
  const { portal } = state;
  const [org, setOrg] = useState<Row>();
  const [section, setSection] = useState("profile");
  const [create, setCreate] = useState(false);
  return (
    <>
      <ResourceTable
        resource="organizations"
        title="Provider organizations"
        columns={[
          { key: "name", label: "Organization" },
          {
            key: "provider_type",
            label: "Type",
            render: (row) => label(String(row.provider_type)),
          },
          {
            key: "status",
            label: "Status",
            render: (row) => <Status value={row.status} />,
          },
          { key: "source_kind", label: "Provenance" },
          {
            key: "updated_at",
            label: "Updated",
            render: (row) => date(row.updated_at),
          },
        ]}
        onOpen={setOrg}
        extra={
          portal === "admin" && (
            <button className="portal-button" onClick={() => setCreate(true)}>
              Add provider organization
            </button>
          )
        }
      />
      {create && (
        <Modal title="Provider workspace" onClose={() => setCreate(false)}>
          <CreateOrganization
            onDone={(row) => {
              setCreate(false);
              setOrg(row);
            }}
          />
        </Modal>
      )}
      {org && (
        <Modal title={String(org.name)} onClose={() => setOrg(undefined)}>
          <PortalStateContext.Provider
            value={{ ...state, organizationId: String(org.id) }}
          >
            {portal === "admin" ? (
              <>
                <div
                  className="portal-tabs"
                  role="navigation"
                  aria-label="Organization sections"
                >
                  {providerSections
                    .filter(
                      ([key]) =>
                        ![
                          "dashboard",
                          "onboarding",
                          "notifications",
                          "settings",
                        ].includes(key),
                    )
                    .map(([key, title]) => (
                      <button
                        key={key}
                        className={`portal-button ${section === key ? "" : "secondary"}`}
                        onClick={() => setSection(key)}
                      >
                        {title}
                      </button>
                    ))}
                </div>
                <ProviderContent section={section} />
                <Panel title="Organization availability">
                  <CommandForm
                    action="organization_status"
                    input={{ organizationId: org.id }}
                    fields={[
                      {
                        key: "status",
                        label: "Status",
                        type: "select",
                        options: ["active", "suspended", "archived"],
                      },
                    ]}
                    initial={{ status: org.status }}
                  />
                </Panel>
              </>
            ) : (
              <>
                <p>
                  Open the published provider profile for public information.
                  Private submissions are visible only when you are assigned as
                  reviewer.
                </p>
                {org.hospital_id && (
                  <PublicProvider id={String(org.hospital_id)} />
                )}
                <Submissions organizationId={String(org.id)} />
                <Verification organizationId={String(org.id)} />
              </>
            )}
          </PortalStateContext.Provider>
        </Modal>
      )}
    </>
  );
}
function PublicProvider({ id }: { id: string }) {
  const { data } = useResource<{ rows: Row[] }>("hospitals", { id });
  const row = data?.rows[0];
  return row ? (
    <Panel title="Published provider">
      <p>{String(row.description)}</p>
      <a
        className="portal-button secondary"
        href={publicUrl(`/hospitals/${row.slug}`)}
        target="_blank"
        rel="noreferrer"
      >
        Open public profile
      </a>
    </Panel>
  ) : (
    <Empty title="No published profile is visible" />
  );
}
const catalogFields: Record<string, Field[]> = {
  countries: [
    { key: "slug", label: "Slug" },
    { key: "iso_code", label: "ISO country code" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "travel_note", label: "Travel note", type: "textarea" },
  ],
  cities: [
    { key: "slug", label: "Slug" },
    {
      key: "country_id",
      label: "Country",
      type: "select",
      catalog: "countries",
    },
  ],
  specialties: [{ key: "slug", label: "Slug" }],
  treatments: [
    { key: "slug", label: "Slug" },
    {
      key: "specialty_id",
      label: "Specialty",
      type: "select",
      catalog: "specialties",
    },
    { key: "category", label: "Category" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "overview", label: "Overview", type: "textarea" },
    {
      key: "procedure_summary",
      label: "Procedure information",
      type: "textarea",
    },
    { key: "indications", label: "Indications", type: "textarea" },
    { key: "diagnostics", label: "Diagnostics", type: "textarea" },
    { key: "recovery", label: "Recovery information", type: "textarea" },
    {
      key: "typical_stay_days",
      label: "Typical stay (days)",
      type: "number",
      min: 1,
    },
  ],
  healthcare_services: [
    { key: "slug", label: "Slug" },
    { key: "description", label: "Description", type: "textarea" },
    {
      key: "href",
      label: "MedBridge page path",
      help: "An internal path, for example /plan/medical-visa.",
    },
    {
      key: "category",
      label: "Category",
      type: "select",
      options: ["plan", "treat", "recover"],
    },
    { key: "steps", label: "Steps", type: "list" },
  ],
  hospitals: [
    { key: "description", label: "Description", type: "textarea" },
    { key: "city_id", label: "City", type: "select", catalog: "cities" },
    { key: "bed_count", label: "Bed count", type: "number", min: 0 },
    { key: "infrastructure", label: "Facilities", type: "list" },
    { key: "accreditation_note", label: "Accreditation note" },
  ],
  doctors: [
    { key: "description", label: "Biography", type: "textarea" },
    { key: "home_city_id", label: "City", type: "select", catalog: "cities" },
    { key: "experience_years", label: "Experience", type: "number", min: 0 },
    { key: "languages", label: "Languages", type: "list" },
    {
      key: "consultation_mode",
      label: "Consultation mode",
      type: "select",
      options: ["video", "in-person", "both"],
    },
    { key: "qualifications_note", label: "Credentials", type: "textarea" },
  ],
  packages: [
    { key: "description", label: "Description", type: "textarea" },
    { key: "duration_days", label: "Duration", type: "number", min: 1 },
    { key: "currency", label: "Currency" },
    { key: "estimated_min", label: "Minimum estimate", type: "number", min: 0 },
    { key: "estimated_max", label: "Maximum estimate", type: "number", min: 0 },
    { key: "valid_from", label: "Valid from", type: "date" },
    { key: "valid_until", label: "Valid until", type: "date" },
    { key: "benefits", label: "Benefits", type: "list" },
  ],
};
function CatalogWorkspace({ entity }: { entity: string }) {
  const [selected, setSelected] = useState<Row | null | undefined>();
  const [draft, setDraft] = useState<Row>();
  const [editDraft, setEditDraft] = useState(false);
  return (
    <>
      <ResourceTable
        resource={entity}
        title={`Canonical ${label(entity)}`}
        columns={[
          { key: "name", label: "Name" },
          {
            key: "publication_status",
            label: "Publication",
            render: (row) => (
              <Status value={row.publication_status ?? row.status} />
            ),
          },
          { key: "source_kind", label: "Provenance" },
          {
            key: "updated_at",
            label: "Updated",
            render: (row) => date(row.updated_at),
          },
        ]}
        onOpen={setSelected}
        extra={
          !["hospitals", "doctors", "packages"].includes(entity) && (
            <button className="portal-button" onClick={() => setSelected(null)}>
              Add {label(entity)}
            </button>
          )
        }
      />
      {["hospitals", "doctors", "packages"].includes(entity) && (
        <Panel title="Add provider content">
          <p>
            Create hospitals, doctors and packages through Providers, then
            review and publish the submitted snapshots.
          </p>
        </Panel>
      )}
      <ResourceTable
        resource="catalog_drafts"
        title="Catalog revision queue"
        params={{ entity }}
        columns={[
          { key: "name", label: "Name" },
          {
            key: "status",
            label: "Status",
            render: (row) => <Status value={row.status} />,
          },
          { key: "revision", label: "Revision" },
          {
            key: "updated_at",
            label: "Updated",
            render: (row) => date(row.updated_at),
          },
        ]}
        onOpen={setDraft}
      />
      {selected !== undefined && (
        <CatalogForm
          entity={entity}
          row={selected ?? undefined}
          onClose={() => setSelected(undefined)}
        />
      )}{" "}
      {draft && editDraft ? (
        <CatalogForm
          entity={entity}
          row={{
            ...draft.data,
            name: draft.name,
            id: draft.target_id as string | undefined,
          }}
          draft={draft}
          onClose={() => {
            setEditDraft(false);
            setDraft(undefined);
          }}
        />
      ) : (
        draft && (
          <Modal
            title={`Catalog revision: ${draft.name}`}
            onClose={() => setDraft(undefined)}
          >
            <dl className="portal-facts">
              {Object.entries(draft.data ?? {}).map(([key, value]) => (
                <div key={key}>
                  <dt>{label(key)}</dt>
                  <dd>
                    {Array.isArray(value)
                      ? value.join(", ")
                      : String(value ?? "")}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="portal-actions">
              {!["published", "archived"].includes(String(draft.status)) && (
                <button
                  className="portal-button secondary"
                  onClick={() => setEditDraft(true)}
                >
                  Edit revision
                </button>
              )}
              {draft.status === "draft" && (
                <Action
                  action="approve_catalog"
                  input={{
                    draftId: draft.id,
                    expectedRevision: draft.revision,
                  }}
                  onDone={setDraft}
                >
                  Approve revision
                </Action>
              )}
              {draft.status === "approved" && (
                <Action
                  action="publish_catalog"
                  input={{
                    draftId: draft.id,
                    expectedRevision: draft.revision,
                  }}
                  confirm
                  onDone={setDraft}
                >
                  Publish revision
                </Action>
              )}
              {!["published", "archived"].includes(String(draft.status)) && (
                <Action
                  action="archive_catalog_draft"
                  input={{
                    draftId: draft.id,
                    expectedRevision: draft.revision,
                  }}
                  confirm
                  danger
                  onDone={setDraft}
                >
                  Archive revision
                </Action>
              )}
            </div>
          </Modal>
        )
      )}
    </>
  );
}
function CatalogForm({
  entity,
  row,
  draft,
  onClose,
}: {
  entity: string;
  row?: Row;
  draft?: Row;
  onClose: () => void;
}) {
  const { command } = usePortal();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const newFields =
    !row && !["cities"].includes(entity)
      ? [
          {
            key: "source_kind",
            label: "Provenance",
            type: "select" as const,
            options: ["synthetic", "first_party", "external"],
          },
        ]
      : [];
  const fields = [
    ...catalogFields[entity],
    { key: "aliases", label: "Search aliases", type: "list" as const },
    ...newFields,
    ...(entity !== "cities"
      ? [
          {
            key: "source_record_id",
            label: "Traceable source record",
            type: "select" as const,
            catalog: "source_records",
          },
        ]
      : []),
  ];
  const form = useForm<{
    name: string;
    values: Record<string, string | boolean | string[]>;
  }>({
    resolver: zodResolver(
      z.object({
        name: z.string().trim().min(2).max(180),
        values: z.record(
          z.string(),
          z.union([z.string().max(10000), z.boolean(), z.array(z.string())]),
        ),
      }),
    ),
    defaultValues: {
      name: String(row?.name ?? ""),
      values: Object.fromEntries(
        fields.map((field) => [
          field.key,
          Array.isArray(row?.[field.key])
            ? (row[field.key] as string[]).join("\n")
            : String(
                row?.[field.key] ??
                  (field.key === "source_kind" ? "synthetic" : ""),
              ),
        ]),
      ),
    },
  });
  return (
    <Modal
      title={row ? `Edit ${row.name}` : `New ${label(entity)}`}
      onClose={onClose}
      dirty={form.formState.isDirty}
    >
      <form
        className="portal-form"
        onSubmit={form.handleSubmit(async (values) => {
          setBusy(true);
          setError("");
          try {
            const data = {
              ...draft?.data,
              ...Object.fromEntries(
                fields
                  .filter((field) => values.values[field.key] !== "")
                  .map((field) => [
                    field.key,
                    field.type === "number"
                      ? Number(values.values[field.key])
                      : field.type === "list"
                        ? String(values.values[field.key])
                            .split("\n")
                            .filter(Boolean)
                        : values.values[field.key],
                  ]),
              ),
            };
            await command("save_catalog_draft", {
              entity,
              targetId: row?.id,
              ...(draft
                ? { draftId: draft.id, expectedRevision: draft.revision }
                : {}),
              name: values.name,
              data,
            });
            form.reset(values);
            onClose();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Unable to save revision.",
            );
          } finally {
            setBusy(false);
          }
        })}
      >
        <label className="portal-field">
          <span>Name *</span>
          <input
            {...form.register("name")}
            required
            minLength={2}
            maxLength={180}
          />
        </label>
        <div className="portal-form-grid">
          {fields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              register={form.register}
              defaultValue={row?.[field.key]}
            />
          ))}
        </div>
        {error && (
          <p className="portal-field-error" role="alert">
            {error}
          </p>
        )}
        <button className="portal-button" disabled={busy}>
          Save reviewed catalog draft
        </button>
      </form>
      {row?.id && !draft && (
        <Action
          action="unpublish_catalog"
          input={{
            entity,
            targetId: row.id,
            expectedUpdatedAt: row.updated_at,
          }}
          danger
          confirm
        >
          Unpublish
        </Action>
      )}
    </Modal>
  );
}
function PlatformSettings() {
  const { context } = usePortal();
  const { data, error, loading } = useResource<{ rows: Row[] }>(
    "portal_settings",
  );
  const required = data?.rows.find(
    (row) => row.key === "provider_required_fields",
  );
  return (
    <>
      {error ? (
        <ErrorPanel message={error} />
      ) : loading ? (
        <Loading />
      ) : (
        <Panel title="Provider publication requirements">
          <p>
            Identity evidence is required for first-party provider publication.
            Providers cannot disable this safeguard.
          </p>
          {context.role === "super_admin" ? (
            <CommandForm
              action="save_setting"
              input={{ key: "provider_required_fields" }}
              fields={[
                {
                  key: "value",
                  label: "Required organization fields",
                  type: "list",
                  help: "Keep name, description and cityId. Other supported keys include email, phone, address and website.",
                },
              ]}
              initial={{ value: required?.value }}
              submit="Save platform requirements"
            />
          ) : (
            <p>Only Super Admin can change platform requirements.</p>
          )}
        </Panel>
      )}
      <Panel title="Catalog provenance">
        <CommandForm
          action="create_source"
          fields={[
            { key: "name", label: "Source name" },
            {
              key: "sourceKind",
              label: "Source kind",
              type: "select",
              options: ["synthetic", "first_party", "external"],
            },
            { key: "url", label: "Authoritative source URL", type: "url" },
            { key: "notes", label: "Evidence notes", type: "textarea" },
          ]}
          initial={{ sourceKind: "first_party" }}
          submit="Record traceable source"
        />
      </Panel>
      <Preferences />
    </>
  );
}
function Analytics() {
  const { data, error, loading } =
    useResource<Record<string, unknown>>("analytics");
  return error ? (
    <ErrorPanel message={error} />
  ) : loading ? (
    <Loading />
  ) : (
    <>
      <Dashboard />
      {["submissionStates", "caseStates"].map((key) => (
        <Panel key={key} title={label(key.replace(/([A-Z])/g, " $1"))}>
          <dl className="portal-facts">
            {Object.entries((data?.[key] ?? {}) as Record<string, number>).map(
              ([state, count]) => (
                <div key={state}>
                  <dt>{label(state)}</dt>
                  <dd>{count}</dd>
                </div>
              ),
            )}
          </dl>
        </Panel>
      ))}
    </>
  );
}
function Workload() {
  const { context } = usePortal();
  const manager = ["support_manager", "admin", "super_admin"].includes(
    context.role ?? "",
  );
  const [member, setMember] = useState<Row>();
  return (
    <>
      <Panel title="Team workload">
        <p>
          Managers can inspect authorized queues, assign cases and track each
          team member’s tasks.
        </p>
      </Panel>
      <ResourceTable
        resource={manager ? "workload" : "staff"}
        title="Active operations team"
        columns={[
          { key: "name", label: "Staff member" },
          {
            key: "role",
            label: "Role",
            render: (row) => label(String(row.role)),
          },
          ...(manager
            ? [
                { key: "open_cases", label: "Open cases" },
                { key: "open_tasks", label: "Open tasks" },
                { key: "overdue_tasks", label: "Overdue tasks" },
              ]
            : []),
        ]}
        onOpen={manager ? setMember : undefined}
      />
      {member && (
        <Modal
          title={`Queue: ${member.name}`}
          onClose={() => setMember(undefined)}
        >
          <Cases assignedTo={String(member.id)} />
        </Modal>
      )}
      <Cases />
      <Tasks />
    </>
  );
}
function Audit() {
  const [row, setRow] = useState<Row>();
  return (
    <>
      <ResourceTable
        resource="audit_events"
        title="Immutable audit log"
        columns={activityColumns}
        onOpen={setRow}
      />
      {row && (
        <Modal
          title={label(String(row.event_name))}
          onClose={() => setRow(undefined)}
        >
          <dl className="portal-facts">
            {[
              "actor_id",
              "actor_role",
              "entity_type",
              "entity_id",
              "organization_id",
              "occurred_at",
            ].map((key) => (
              <div key={key}>
                <dt>{label(key)}</dt>
                <dd>{String(row[key] ?? "—")}</dd>
              </div>
            ))}
          </dl>
          {["old_value", "new_value", "metadata"].map((key) => (
            <details key={key}>
              <summary>{label(key)}</summary>
              <pre className="portal-audit-value">
                {JSON.stringify(row[key] ?? {}, null, 2)}
              </pre>
            </details>
          ))}
        </Modal>
      )}
    </>
  );
}
