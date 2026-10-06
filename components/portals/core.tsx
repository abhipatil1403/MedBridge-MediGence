"use client";
import { trapDialogFocus } from "@/components/dialog-focus";
import { Localized } from '@/components/experience/localized';

import { T, LocalDateTime } from '@/components/experience/translation';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import type { Portal, PortalContext, Row } from "@/lib/portals/config";
import { label } from "@/lib/portals/config";

export type PortalState = {
  referenceMode?: boolean;
  portal: Portal;
  context: PortalContext;
  organizationId: string;
  token: string;
  epoch: number;
  refresh: () => void;
  request: <T>(resource: string, params?: Record<string, string>) => Promise<T>;
  command: (action: string, input: Record<string, unknown>) => Promise<Row>;
  notice: (message: string) => void;
};
export const PortalStateContext = createContext<PortalState | null>(null);
export function usePortal() {
  const value = useContext(PortalStateContext);
  if (!value) throw new Error("Portal state missing");
  return value;
}
export function useResource<T>(
  resource: string,
  params: Record<string, string> = {},
) {
  const { request, epoch, context, portal } = usePortal();
  const [result, setResult] = useState<{
    tag: string;
    data?: T;
    error: string;
  }>({ tag: "", error: "" });
  const key = JSON.stringify(params);
  const tag = `${portal}:${context.userId}:${resource}:${key}:${epoch}`;
  useEffect(() => {
    let active = true;
    if (!resource) return;
    request<T>(resource, JSON.parse(key))
      .then((data) => {
        if (active) setResult({ tag, data, error: "" });
      })
      .catch((err) => {
        if (active)
          setResult({
            tag,
            error:
              err instanceof Error
                ? err.message
                : "Unable to load this workspace.",
          });
      });
    return () => {
      active = false;
    };
  }, [resource, key, request, tag]);
  return {
    data: result.tag === tag ? result.data : undefined,
    error: result.tag === tag ? result.error : "",
    loading: Boolean(resource) && result.tag !== tag,
  };
}
export function Status({ value }: { value: unknown }) {
  return (
    <span className={`portal-status status-${String(value ?? "draft")}`} data-status={String(value ?? "draft")}>
      <span className="portal-status-dot" aria-hidden="true"/>
      <T>{label(String(value ?? "draft"))}</T>
    </span>
  );
}
export function Loading() {
  return (
    <div className="portal-resource-skeleton" aria-busy="true"><p className="sr-only" role="status"><T>{'Preparing your page'}</T></p><div aria-hidden="true">{[1,2,3,4].map(row=><div className="portal-skeleton-row" key={row}><div className="skeleton-line skeleton-line--wide"/><div className="skeleton-line"/></div>)}</div></div>
  );
}
export function ErrorPanel({ message }: { message: string }) {
  const { refresh } = usePortal();
  return (
    <div className="portal-error" role="alert">
      <p><T>{message}</T></p>
      <button className="portal-button secondary" onClick={refresh}>
        <T>{"Try again"}</T></button>
    </div>
  );
}
export function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf())
    ? "—"
      : <LocalDateTime value={parsed.toISOString()}/>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="portal-empty">
      <Check size={24} />
      <h3><T>{title}</T></h3>
      {children}
    </div>
  );
}
export function Panel({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="portal-panel">
      {title && (
        <header className="portal-panel-heading">
          <h2><T>{title}</T></h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
export function Modal({
  title,
  children,
  onClose,
  dirty = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
  const titleId = useId();
  const close = () => (dirty ? setConfirm(true) : onClose());
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog onKeyDown={trapDialogFocus}
      ref={ref}
      className="portal-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id={titleId}><T>{title}</T></h2>
        <Localized as="button"
          onClick={close}
          className="portal-icon-button"
          aria-label="Close dialog"
        >
          <X size={20} />
        </Localized>
      </header>
      {confirm ? (
        <div className="portal-confirm">
          <h3><T>{"Discard unsaved changes?"}</T></h3>
          <p><T>{"Your saved revision is unchanged."}</T></p>
          <div className="portal-actions">
            <button className="portal-button" onClick={() => setConfirm(false)}>
              <T>{"Keep editing"}</T></button>
            <button className="portal-button danger" onClick={onClose}>
              <T>{"Discard changes"}</T></button>
          </div>
        </div>
      ) : (
        children
      )}
    </dialog>
  );
}
export function Action({
  action,
  input,
  children,
  danger = false,
  confirm = false,
  onDone,
}: {
  action: string;
  input: Record<string, unknown>;
  children: ReactNode;
  danger?: boolean;
  confirm?: boolean;
  onDone?: (row: Row) => void;
}) {
  const { command } = usePortal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await command(action, {
        ...input,
        ...(confirm ? { confirmed: true } : {}),
      });
      setConfirming(false);
      onDone?.(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to complete this action.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="portal-action">
      <button
        disabled={busy}
        className={`portal-button ${danger ? "danger" : "secondary"}`}
        onClick={() => (confirm ? setConfirming(true) : void run())}
      >
        {busy ? <T>{"Saving…"}</T> : typeof children==='string'?<T>{children}</T>:children}
      </button>
      {error && (
        <span className="portal-field-error" role="alert">
          {error}
        </span>
      )}
      {confirming && (
        <Modal title="Confirm action" onClose={() => setConfirming(false)}>
          <p><T>{"This action changes the availability or status of this record."}</T></p>
          <div className="portal-actions">
            <button
              className="portal-button secondary"
              onClick={() => setConfirming(false)}
            >
              <T>{"Cancel"}</T></button>
            <button
              className={`portal-button ${danger ? "danger" : ""}`}
              disabled={busy}
              onClick={() => void run()}
            >
              <T>{"Confirm"}</T></button>
          </div>
        </Modal>
      )}
    </span>
  );
}
type Column = { key: string; label: string; render?: (row: Row) => ReactNode };
export function ResourceTable({
  resource,
  columns,
  params = {},
  onOpen,
  filters = true,
  title,
  extra,
}: {
  resource: string;
  columns: Column[];
  params?: Record<string, string>;
  onOpen?: (row: Row) => void;
  filters?: boolean;
  title?: string;
  extra?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [paging, setPaging] = useState({ key: "", page: 1 });
  const [status, setStatus] = useState("");
  const [direction, setDirection] = useState("desc");
  const [sort, setSort] = useState("");
  const paramsKey = JSON.stringify([params, query, status, sort, direction]);
  const page = paging.key === paramsKey ? paging.page : 1;
  const setPage = (update: (page: number) => number) =>
    setPaging({ key: paramsKey, page: update(page) });
  const { data, error, loading } = useResource<{ rows: Row[]; total?: number }>(
    resource,
    {
      ...params,
      page: String(page),
      q: query,
      ...(status ? { status } : {}),
      ...(sort ? { sort } : {}),
      direction,
    },
  );
  return (
    <Panel title={title} actions={extra}>
      {filters && (
        <div className="portal-table-tools">
          <label className="portal-search">
            <Search size={16} />
              <span className="sr-only"><T>{"Search"}</T>{' '}<T>{title ?? resource}</T></span>
            <Localized as="input"
              type="search"
              placeholder="Search records"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {[
            "provider_records",
            "provider_submissions",
            "provider_documents",
            "support_cases",
            "support_tasks",
            "catalog_drafts",
          ].includes(resource) && (
            <label>
              <span className="sr-only"><T>{"Status"}</T></span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value=""><T>{"All statuses"}</T></option>
                {(resource === "support_cases"
                  ? [
                      "open",
                      "in_progress",
                      "waiting_patient",
                      "waiting_provider",
                      "escalated",
                      "resolved",
                      "closed",
                    ]
                  : resource === "support_tasks"
                    ? ["open", "in_progress", "completed", "cancelled"]
                    : [
                        "draft",
                        "submitted",
                        "under_review",
                        "changes_requested",
                        "approved",
                        "published",
                        "rejected",
                        "expired",
                        "archived",
                      ]
                ).map((s) => (
                  <option key={s} value={s}>
                    <T>{label(s)}</T>
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="sr-only"><T>{"Sort direction"}</T></span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            >
              <option value="desc"><T>{"Descending"}</T></option>
              <option value="asc"><T>{"Ascending"}</T></option>
            </select>
          </label>
        </div>
      )}
      {error ? (
        <ErrorPanel message={error} />
      ) : loading ? (
        <Loading />
      ) : !data?.rows.length ? (
        <Empty title="No matching records">
          <p>
            <T>{"Saved records will appear here. Adjust your filters or add a record to get started."}</T></p>
        </Empty>
      ) : (
        <>
          <div className="portal-table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} scope="col">
                      {[
                        "name",
                        "status",
                        "priority",
                        "created_at",
                        "updated_at",
                        "revision",
                      ].includes(c.key) ? (
                        <button
                          className="portal-sort"
                          onClick={() => {
                            setSort(c.key);
                            setDirection((d) => (d === "asc" ? "desc" : "asc"));
                          }}
                        >
                          <T>{c.label}</T>
                        </button>
                      ) : (
                        <T>{c.label}</T>
                      )}
                    </th>
                  ))}
                  {onOpen && (
                    <th scope="col">
                      <span className="sr-only"><T>{"Actions"}</T></span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={String(row.id ?? row.user_id ?? row.key ?? index)}>
                    {columns.map((c) => (
                      <td key={c.key}>
                        {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                      </td>
                    ))}
                    {onOpen && (
                      <td>
                        <button
                          className="portal-text-button"
                          onClick={() => onOpen(row)}
                        >
                          <T>{"Open"}</T><span className="sr-only">
                            {" "}
                            {String(
                              row.name ?? row.title ?? row.id ?? "record",
                            )}
                          </span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="portal-pagination">
            <span>
              {data.total ?? data.rows.length} <T>{"records · Page"}</T>{' '}{page}
            </span>
            <div>
              <Localized as="button"
                className="portal-icon-button"
                aria-label="Previous page"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={18} />
              </Localized>
              <Localized as="button"
                className="portal-icon-button"
                aria-label="Next page"
                disabled={page * 20 >= (data.total ?? data.rows.length)}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={18} />
              </Localized>
            </div>
          </footer>
        </>
      )}
    </Panel>
  );
}
export const commonColumns: Column[] = [
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
];
export const activityColumns: Column[] = [
  {
    key: "event_name",
    label: "Action",
    render: (row) => label(String(row.event_name)),
  },
  { key: "actor_role", label: "Role" },
  { key: "entity_type", label: "Resource" },
  { key: "occurred_at", label: "Time", render: (row) => date(row.occurred_at) },
];
