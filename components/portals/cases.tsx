"use client";

import { T } from '@/components/experience/translation';
import { useState } from "react";
import { label, type Field, type Row } from "@/lib/portals/config";
import {
  Action,
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
import { InquiryDetail } from '@/components/inquiries/detail';

export function Cases({
  mode = "all",
  patientId,
  assignedTo,
}: {
  mode?: "all" | "mine" | "escalated" | "messages" | "documents";
  patientId?: string;
  assignedTo?: string;
}) {
  const {portal}=usePortal();
  const [selected, setSelected] = useState<Row>();
  const [filters, setFilters] = useState<Record<string, string>>({});
  return (
    <>
      {portal!=='patient'&&<details className="portal-case-filters"><summary><T>{'Case filters'}</T>{Object.values(filters).filter(Boolean).length>0&&<span> · {Object.values(filters).filter(Boolean).length}</span>}</summary>
        <div className="portal-form-grid">
          {[
            {
              key: "priority",
              label: "Priority",
              options: ["low", "normal", "high", "urgent"],
            },
            {
              key: "caseType",
              label: "Case type",
              options: [
                "coordination",
                "provider",
                "documents",
                "account",
                "other",
              ],
            },
            { key: "assignedTo", label: "Assignment", options: ["me"] },
          ].map((field) => (
            <label className="portal-field" key={field.key}>
              <span><T>{field.label}</T></span>
              <select
                value={filters[field.key] ?? ""}
                onChange={(e) =>
                  setFilters((old) => ({ ...old, [field.key]: e.target.value }))
                }
              >
                <option value=""><T>{"All"}</T></option>
                {field.options.map((value) => (
                  <option key={value} value={value}>
                    <T>{label(value)}</T>
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="portal-field">
            <span><T>{"Created from"}</T></span>
            <input
              type="date"
              value={filters.from ?? ""}
              onChange={(e) =>
                setFilters((old) => ({ ...old, from: e.target.value }))
              }
            />
          </label>
          <label className="portal-field">
            <span><T>{"Created until"}</T></span>
            <input
              type="date"
              value={filters.until ?? ""}
              onChange={(e) =>
                setFilters((old) => ({ ...old, until: e.target.value }))
              }
            />
          </label>
        </div>
      </details>}
      <ResourceTable
        resource="support_cases"
        title={portal==='patient'?'Your requests':mode === "mine"
            ? "My queue"
            : mode === "documents"
              ? "Cases with document context"
              : mode === "messages"
                ? "Case conversations"
                : "Authorized support cases"}
        params={{
          ...filters,
          ...(patientId ? { patientId } : {}),
          ...(assignedTo ? { assignedTo } : {}),
          ...(mode === "documents" ? { sharedDocuments: "true" } : {}),
          ...(mode === "mine"
            ? { assignedTo: "me" }
            : mode === "escalated"
              ? { status: "escalated" }
              : {}),
        }}
        columns={portal==='patient'?[{key:'title',label:'Request'},{key:'status',label:'Status',render:row=><Status value={row.status}/>},{key:'updated_at',label:'Updated',render:row=>date(row.updated_at)}]:[
          {
            key: "id",
            label: "Case",
            render: (row) => String(row.id).slice(0, 8),
          },
          { key: "title", label: "Request" },
          {
            key: "case_type",
            label: "Type",
            render: (row) => label(String(row.case_type)),
          },
          {
            key: "status",
            label: "Status",
            render: (row) => <Status value={row.status} />,
          },
          {
            key: "priority",
            label: "Priority",
            render: (row) => <Status value={row.priority} />,
          },
          {
            key: "assigned_to",
            label: "Assigned",
            render: (row) =>
              row.assigned_to
                ? String(row.assigned_to).slice(0, 8)
                : "Unassigned",
          },
          {
            key: "updated_at",
            label: "Updated",
            render: (row) => date(row.updated_at),
          },
        ]}
        onOpen={setSelected}
      />
      {selected && (
        selected.inquiry_source&&selected.inquiry_source!=='legacy'?<Modal title="Care coordination request" onClose={()=>setSelected(undefined)}><InquiryDetail id={String(selected.id)} portal={portal}/></Modal>:
        <CaseDetail
          id={String(selected.id)}
          onClose={() => setSelected(undefined)}
        />
      )}
    </>
  );
}
export function CaseDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { portal, context } = usePortal();
  const staff = ["admin", "support"].includes(portal);
  const { data, error, loading } = useResource<{
    case: Row;
    patient: { email: string; displayName?: string };
    messages: Row[];
    timeline: Row[];
    tasks: Row[];
    conversation?: Row[];
    plan?: Row;
    documents?: Row;
  }>("case_context", { id });
  const c = data?.case;
  if(c?.inquiry_source&&c.inquiry_source!=='legacy')return <Modal title="Care coordination request" onClose={onClose}><InquiryDetail id={id} portal={portal}/></Modal>;
  const messageFields: Field[] = [
    {
      key: "visibility",
      label: "Message visibility",
      type: "select",
      options: staff
        ? ["patient", "provider", "shared", "internal"]
        : portal === "provider"
          ? ["provider", "shared"]
          : ["patient", "shared"],
    },
    { key: "body", label: "Message / note", type: "textarea" },
  ];
  return (
    <Modal
      title={String(c?.title ?? `Case ${id.slice(0, 8)}`)}
      onClose={onClose}
    >
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorPanel message={error} />
      ) : (
        data &&
        c && (
          <>
            <div className="portal-actions">
              <Status value={c.status} />
              <Status value={c.priority} />
              <span>{date(c.created_at)}</span>
            </div>
            <p>{String(c.description ?? "")}</p>
            <details open={portal!=='patient'} className="privacy-sharing"><summary><T>{'Privacy & sharing'}</T></summary><Panel title="Authorized context">
              <dl className="portal-facts">
                <div>
                  <dt><T>{"Patient"}</T></dt>
                  <dd>{data.patient.displayName ?? data.patient.email}</dd>
                </div>
                <div>
                  <dt><T>{"Consent"}</T></dt>
                  <dd>
                    <T>{c.consent_revoked_at ? "Revoked" : "Granted for this case"}</T>
                  </dd>
                </div>
                <div>
                  <dt><T>{"Conversation sharing"}</T></dt>
                  <dd><T>{c.share_conversation ? "Enabled" : "Not shared"}</T></dd>
                </div>
                <div>
                  <dt><T>{"Document sharing"}</T></dt>
                  <dd><T>{c.share_documents ? "Enabled" : "Not shared"}</T></dd>
                </div>
                <div>
                  <dt><T>{"Provider sharing"}</T></dt>
                  <dd><T>{c.share_with_provider ? "Enabled" : "Not shared"}</T></dd>
                </div>
              </dl>
              {data.conversation && (
                <details>
                  <summary>
                    <T>{"Shared conversation ·"}</T>{' '}{data.conversation.length} <T>{"messages"}</T></summary>
                  {data.conversation.map((row, index) => (
                    <article className="portal-message" key={index}>
                      <strong>{label(String(row.role))}</strong>
                      <p>{String(row.content)}</p>
                    </article>
                  ))}
                </details>
              )}
              {data.plan && (
                <details>
                  <summary><T>{"Shared care plan"}</T></summary>
                  <h3>{String(data.plan.title ?? "Care plan")}</h3>
                  <p>{String(data.plan.goal ?? "")}</p>
                  {Array.isArray(data.plan.tasks) &&
                    (data.plan.tasks as Row[]).map((task) => (
                      <p key={String(task.id)}>
                        {String(task.title)} · {String(task.status)}
                      </p>
                    ))}
                </details>
              )}
              {data.documents && (
                <details>
                  <summary><T>{"Shared document workspace"}</T></summary>
                  <SharedDocuments documents={data.documents} caseId={id} />
                </details>
              )}
            </Panel></details>
            <Panel title="Conversation">
              {data.messages.length ? (
                data.messages.map((row) => (
                  <article
                    className={`portal-message visibility-${row.visibility}`}
                    key={row.id}
                  >
                    <header>
                      <Status value={row.visibility} />
                      <time>{date(row.created_at)}</time>
                    </header>
                    <p>{String(row.body)}</p>
                  </article>
                ))
              ) : (
                <Empty title="No case messages yet" />
              )}
              {!c.consent_revoked_at && (
                <CommandForm
                  action="message"
                  input={{ caseId: id }}
                  fields={messageFields}
                  initial={{
                    visibility: staff
                      ? "patient"
                      : portal === "provider"
                        ? "provider"
                        : "patient",
                  }}
                  submit="Send message"
                />
              )}
            </Panel>
            {staff && (
              <>
                <Panel title="Case assignment & status">
                  <CommandForm
                    action="update_case"
                    input={{ caseId: id, expectedRevision: c.revision }}
                    fields={[
                      {
                        key: "status",
                        label: "Status",
                        type: "select",
                        options: [
                          "open",
                          "in_progress",
                          "waiting_patient",
                          "waiting_provider",
                          "escalated",
                          "resolved",
                          "closed",
                        ],
                      },
                      {
                        key: "priority",
                        label: "Priority",
                        type: "select",
                        options: ["low", "normal", "high", "urgent"],
                      },
                      ...(["support_manager", "admin", "super_admin"].includes(
                        context.role ?? "",
                      )
                        ? [
                            {
                              key: "assignedTo",
                              label: "Assigned staff",
                              type: "select" as const,
                              catalog: "staff",
                            },
                          ]
                        : []),
                      { key: "dueAt", label: "Follow-up due", type: "date" },
                      {
                        key: "reason",
                        label: "Escalation reason",
                        type: "textarea",
                      },
                    ]}
                    initial={{
                      status: c.status,
                      priority: c.priority,
                      assignedTo: c.assigned_to,
                      dueAt: c.due_at ? String(c.due_at).slice(0, 10) : "",
                    }}
                    submit="Update case"
                  />
                  {!c.assigned_to && (
                    <Action
                      action="update_case"
                      input={{
                        caseId: id,
                        expectedRevision: c.revision,
                        assignedTo: context.userId,
                      }}
                    >
                      <T>{"Assign to me"}</T></Action>
                  )}
                </Panel>
                <Panel title="Tasks">
                  <CommandForm
                    action="save_task"
                    input={{ caseId: id }}
                    fields={[
                      { key: "title", label: "Task title" },
                      {
                        key: "assignedTo",
                        label: "Assigned staff",
                        type: "select",
                        catalog: "staff",
                      },
                      { key: "dueAt", label: "Due date", type: "date" },
                      {
                        key: "priority",
                        label: "Priority",
                        type: "select",
                        options: ["low", "normal", "high", "urgent"],
                      },
                    ]}
                    initial={{ priority: "normal", assignedTo: context.userId }}
                    submit="Create task"
                  />
                  {data.tasks.map((task) => (
                    <TaskEditor key={task.id} task={task} />
                  ))}
                </Panel>
              </>
            )}
            <Panel title="Case timeline">
              <ol className="portal-timeline">
                {data.timeline.map((row) => (
                  <li key={row.id}>
                    <strong>{label(String(row.action))}</strong>
                    <p>{String(row.summary)}</p>
                    <small>
                      {date(row.created_at)} · {label(String(row.visibility))}
                    </small>
                  </li>
                ))}
              </ol>
            </Panel>
            {portal === "patient" && !c.consent_revoked_at && (
              <Action
                action="revoke_consent"
                input={{ caseId: id }}
                danger
                confirm
              >
                <T>{"Revoke support access"}</T></Action>
            )}
          </>
        )
      )}
    </Modal>
  );
}
function SharedDocuments({
  documents,
  caseId,
}: {
  documents: Row;
  caseId: string;
}) {
  const { portal, token } = usePortal();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const download = async (item: Row) => {
    setBusy(String(item.id));
    setError("");
    try {
      const query = new URLSearchParams({
        portal,
        caseId,
        documentId: String(item.id),
      });
      const result = await fetch(`/api/portals/case-document?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!result.ok) throw new Error((await result.json()).error);
      const url = URL.createObjectURL(await result.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = String(item.filename);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download.");
    } finally {
      setBusy("");
    }
  };
  const entries = Array.isArray(documents.items)
    ? documents.items
    : Array.isArray(documents.documents)
      ? documents.documents
      : [];
  return (
    <>
      {entries.length ? (
        <ul>
          {(entries as Row[]).map((item, index) => (
            <li key={String(item.id ?? index)}>
              {String(item.filename ?? item.name ?? item.title ?? "Document")} ·{" "}
              {String(item.uploadStatus ?? item.status ?? "Not reviewed")}
              {item.uploadStatus === "uploaded" && (
                <button
                  className="portal-button secondary"
                  disabled={Boolean(busy)}
                  onClick={() => void download(item)}
                >
                  <T>{busy === item.id ? "Downloading…" : "Download shared file"}</T>
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p><T>{"No document metadata is present in this shared workspace."}</T></p>
      )}
      {Array.isArray(documents.requirements) && (
        <>
          <h4><T>{"Document requirements"}</T></h4>
          <ul>
            {(documents.requirements as Row[]).map((item) => (
              <li key={String(item.id)}>
                {String(item.label)} · {String(item.status)}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p role="alert" className="portal-field-error">
          {error}
        </p>
      )}
    </>
  );
}
export function TaskEditor({ task }: { task: Row }) {
  return (
    <details className="portal-task">
      <summary>
        {String(task.title)} · {label(String(task.status))} ·{" "}
        {date(task.due_at)}
      </summary>
      <CommandForm
        action="save_task"
        input={{
          caseId: task.case_id,
          taskId: task.id,
          expectedRevision: task.revision,
        }}
        fields={[
          { key: "title", label: "Task" },
          {
            key: "assignedTo",
            label: "Assignee",
            type: "select",
            catalog: "staff",
          },
          { key: "dueAt", label: "Due date", type: "date" },
          {
            key: "priority",
            label: "Priority",
            type: "select",
            options: ["low", "normal", "high", "urgent"],
          },
          {
            key: "status",
            label: "Status",
            type: "select",
            options: ["open", "in_progress", "completed", "cancelled"],
          },
        ]}
        initial={{
          title: task.title,
          assignedTo: task.assigned_to,
          dueAt: task.due_at ? String(task.due_at).slice(0, 10) : "",
          priority: task.priority,
          status: task.status,
        }}
      />
    </details>
  );
}
export function Tasks() {
  const [task, setTask] = useState<Row>();
  return (
    <>
      <ResourceTable
        resource="support_tasks"
        title="Support tasks"
        columns={[
          { key: "title", label: "Task" },
          {
            key: "status",
            label: "Status",
            render: (row) => <Status value={row.status} />,
          },
          {
            key: "priority",
            label: "Priority",
            render: (row) => <Status value={row.priority} />,
          },
          { key: "due_at", label: "Due", render: (row) => date(row.due_at) },
        ]}
        onOpen={setTask}
      />
      {task && (
        <Modal title="Task details" onClose={() => setTask(undefined)}>
          <TaskEditor task={task} />
        </Modal>
      )}
    </>
  );
}
