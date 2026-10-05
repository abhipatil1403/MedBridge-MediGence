"use client";

import { T, useTranslation } from '@/components/experience/translation';
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ReferenceClaims } from "./reference-claims";
import { PackageReview } from './package-review';
import { packagePrice } from '@/lib/catalog/pricing';
import {
  fields,
  label,
  recordInputSchema,
  type RecordKind,
  type Row,
  type Field,
} from "@/lib/portals/config";
import {
  commonColumns,
  date,
  ErrorPanel,
  Modal,
  Panel,
  ResourceTable,
  Status,
  usePortal,
  useResource,
} from "./core";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a name of at least two characters.")
    .max(180),
  values: z.record(
    z.string(),
    z.union([z.string().max(10000), z.boolean(), z.array(z.string())]),
  ),
});
type FormValues = z.infer<typeof formSchema>;
export function FieldControl({
  field,
  register,
  defaultValue,
}: {
  field: Field;
  register: ReturnType<typeof useForm<FormValues>>["register"];
  defaultValue?: unknown;
}) {
  const { organizationId } = usePortal();
  const { data, error, loading } = useResource<{ rows: Row[] }>(
    field.catalog ?? "",
    {
      size: "200",
      ...(["provider_documents", "provider_records"].includes(
        field.catalog ?? "",
      )
        ? { organizationId }
        : {}),
      ...field.catalogParams,
    },
  );
  const inputProps = register(`values.${field.key}`);
  const currentChoice = data?.rows.find((row) => row.id === defaultValue);
  if (field.type === "checkbox")
    return (
      <label className="portal-check">
        <input type="checkbox" {...inputProps} />
        <T>{field.label}</T>
      </label>
    );
  return (
    <label className="portal-field">
      <span><T>{field.label}</T></span>
      {field.type === "list" && field.catalog ? (
        <select
          multiple
          size={5}
          disabled={loading || Boolean(error)}
          {...inputProps}
        >
          {data?.rows.map((row) => (
            <option key={row.id} value={row.id}>
              {String(row.name ?? row.title ?? "Unnamed")}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" || field.type === "list" ? (
        <textarea
          rows={field.type === "list" ? 4 : 3}
          placeholder={field.type === "list" ? "One item per line" : undefined}
          {...inputProps}
        />
      ) : field.type === "select" ? (
        <select disabled={loading || Boolean(error)} {...inputProps}>
          <option value=""><T>{"Select"}</T>{' '}<T>{field.label}</T></option>
          {field.catalog && Boolean(defaultValue) && (
            <option key="current-choice" value={String(defaultValue)}>
              {currentChoice
                ? String(
                    currentChoice.name ??
                      currentChoice.title ??
                      currentChoice.source_name ??
                      "Current selection",
                  )
                : "Current selection"}
              {currentChoice && field.catalog === "cities"
                ? ` · ${String((currentChoice.country as { name?: string } | undefined)?.name ?? "")}`
                : ""}
            </option>
          )}
          {field.options?.map((option) => (
            <option key={option} value={option}>
              <T>{label(option)}</T>
            </option>
          ))}
          {field.catalog &&
            data?.rows.filter((row) => row.id !== defaultValue).map((row) => (
              <option key={row.id} value={row.id}>
                {String(
                  row.name ??
                    row.title ??
                    row.source_name ??
                    (row.data as Record<string, unknown> | undefined)?.title ??
                    `Workspace ${String(row.id).slice(0, 8)}`,
                )}
                {field.catalog === "cities"
                  ? ` · ${String((row.country as { name?: string } | undefined)?.name ?? "")}`
                  : ""}
              </option>
            ))}
          {Boolean(defaultValue) &&
            !field.catalog &&
            !field.options?.includes(String(defaultValue)) &&
            !data?.rows.some((row) => row.id === defaultValue) && (
              <option value={String(defaultValue)}><T>{"Current selection"}</T></option>
            )}
        </select>
      ) : (
        <input
          type={field.type === "number"
              ? "number"
              : field.type === "email"
                ? "email"
                : field.type === "url"
                  ? "url"
                  : field.type === "date"
                    ? "date"
                    : "text"}
          min={field.min}
          step={field.type === "number" ? "any" : undefined}
          {...inputProps}
        />
      )}
      <small>
        <T>{field.help ??
          (field.type === "list"
            ? "Enter only services or facts you can support. One per line."
            : "")}</T>
      </small>
      {loading && <small role="status"><T>{"Loading choices…"}</T></small>}
      {error && (
        <small role="alert" className="portal-field-error">
          {error}
        </small>
      )}
    </label>
  );
}
export function RecordForm({
  kind,
  row,
  onClose,
}: {
  kind: RecordKind;
  row?: Row;
  onClose: () => void;
}) {
  const { organizationId, command, referenceMode } = usePortal();
  const {t}=useTranslation();
  const formFields: Field[] = referenceMode ? [...fields[kind], ...(!["organization", "location", "package"].includes(kind) ? [{key:"locationId",label:"Exact sourced location",type:"select" as const,catalog:"provider_records",catalogParams:{kind:"location"},help:"This offering applies only to the selected branch. Create another separately sourced record for another branch."}] : [])] : fields[kind];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const defaultValues: FormValues = {
    name: String(row?.name ?? ""),
    values: Object.fromEntries(
      formFields.map((field) => {
        const entry = row?.data?.[field.key];
        return [
          field.key,
          field.type === "checkbox"
            ? Boolean(entry)
            : field.type === "list" && field.catalog
              ? Array.isArray(entry)
                ? entry
                : []
              : Array.isArray(entry)
                ? entry.join("\n")
                : entry == null
                  ? ""
                  : String(entry),
        ];
      }),
    ),
  };
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });
  useEffect(() => {
    if (!form.formState.isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [form.formState.isDirty]);
  const save = form.handleSubmit(async (values) => {
    setError("");
    const data: Record<string, unknown> = { ...row?.data };
    for (const field of formFields) {
      const value = values.values[field.key];
      if (referenceMode && ((field.type === "checkbox" && value === false && row?.data?.[field.key] === undefined && !form.getFieldState(`values.${field.key}`).isDirty) || (Array.isArray(value) && !value.length))) {delete data[field.key];continue;}
      if (value === "" || value === undefined) {
        delete data[field.key];
        continue;
      }
      data[field.key] =
        field.type === "number"
          ? Number(value)
          : field.type === "list"
            ? Array.isArray(value)
              ? value
              : String(value)
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean)
            : value;
    }
    const parsed = recordInputSchema.safeParse({
      organizationId,
      ...(row ? { recordId: row.id, expectedRevision: row.revision } : {}),
      kind,
      name: values.name,
      data,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      await command("save_record", parsed.data);
      form.reset(values);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  });
  return (
    <Modal
      title={`${t(row?'Edit':'Add')} ${t(label(kind))}`}
      onClose={onClose}
      dirty={form.formState.isDirty}
    >
      <p className="portal-muted">
        <T>{"Save a private draft now. Required fields and evidence are checked when you submit."}</T></p>
      {referenceMode && <p className="portal-muted"><T>{"Enter only facts the source explicitly supports. Leave missing contact information, consultation mode and service inclusions blank. Attach field sources after saving; edits create a new revision that requires fresh source associations."}</T></p>}
      <form onSubmit={save} className="portal-form">
        <label className="portal-field">
          <span>
            <T>{kind === "organization" ? "Organization name" : "Name"}</T> *
          </span>
          <input
            autoFocus
            {...form.register("name")}
            aria-invalid={Boolean(form.formState.errors.name)}
          />
          {form.formState.errors.name && (
            <small className="portal-field-error">
              {form.formState.errors.name.message}
            </small>
          )}
        </label>
        <div className="portal-form-grid">
          {kind === 'package' ? <PackageFields fields={formFields} register={form.register} data={row?.data}/> : formFields.map((field) => (
            <FieldControl
              key={field.key}
              field={field}
              register={form.register}
              defaultValue={row?.data?.[field.key]}
            />
          ))}
        </div>
        {error && (
          <p className="portal-field-error" role="alert">
            {error}
          </p>
        )}
        <div className="portal-actions">
          <button
            className="portal-button secondary"
            type="button"
            onClick={(event) =>
              event.currentTarget
                .closest("dialog")
                ?.dispatchEvent(new Event("cancel", { cancelable: true }))
            }
          >
            <T>{"Cancel"}</T></button>
          <button className="portal-button" disabled={busy} type="submit">
            <T>{busy ? "Saving draft…" : "Save draft"}</T>
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PackageFields({fields: formFields,register,data}: {fields: Field[];register: ReturnType<typeof useForm<FormValues>>['register'];data?: Row['data']}) {
  const groups = [
    {name:'Basic package information',keys:['treatmentId','locationId','description','durationDays','validFrom','validUntil']},
    {name:'Original pricing and evidence',keys:['priceType','price','priceMax','currency','priceSourceUrl','priceSourceName','priceCheckedAt','priceValidFrom','priceValidUntil']},
    {name:'Included and excluded services',keys:['inclusions','exclusions', ...['procedure','hospitalStay','consultation','diagnostics','followUp','rehabilitation'].flatMap(key=>[`${key}Status`,`${key}Info`])]},
    {name:'Travel and patient services',keys:['accommodation','transfer','localTransport','interpreter','visaAssistance'].flatMap(key=>[`${key}Status`,`${key}Info`])},
    {name:'Conditions and supporting documents',keys:['terms','notes','documentIds']},
  ];
  return groups.map(group=><fieldset key={group.name} className="portal-package-fields"><legend><T>{group.name}</T></legend><div className="portal-form-grid">{formFields.filter(field=>group.keys.includes(field.key)).map(field=><FieldControl key={field.key} field={field} register={register} defaultValue={data?.[field.key]}/>)}</div></fieldset>);
}
export function RecordDetails({
  row,
  onClose,
  onEdit,
}: {
  row: Row;
  onClose: () => void;
  onEdit: (row: Row) => void;
}) {
  const { organizationId, portal, referenceMode } = usePortal();
  const [history, setHistory] = useState<Row>();
  return (
    <Modal title={String(row.name)} onClose={onClose}>
      <div className="portal-actions">
        <Status value={row.status} />
        <span>
          <T>{"Draft revision"}</T>{' '}{row.revision} <T>{"· Published revision"}</T>{" "}
          {String(row.published_revision ?? "none")}
        </span>
      </div>
      {row.kind === 'package' && <PackageReview row={row}/>}
      <dl className="portal-facts">
        {Object.entries(row.data ?? {}).map(([key, value]) => (
          <div key={key}>
            <dt><T>{label(key.replace(/([A-Z])/g, " $1"))}</T></dt>
            <dd>
              {Array.isArray(value)
                ? value.join(", ")
                : typeof value === "boolean"
                  ? value
                    ? "Yes"
                    : "No"
                  : String(value ?? "Not provided")}
            </dd>
          </div>
        ))}
      </dl>
      {referenceMode && <ReferenceClaims row={row}/>}
      <div className="portal-actions">
        {!["submitted", "under_review", "archived"].includes(
          String(row.status),
        ) && (
          <button className="portal-button" onClick={() => onEdit(row)}>
            <T>{"Edit draft"}</T></button>
        )}
        <RecordActions row={row} onDone={onClose} />
      </div>
      <ResourceTable
        resource="provider_revisions"
        params={{ organizationId, recordId: String(row.id) }}
        title="Version history"
        columns={[
          { key: "revision", label: "Revision" },
          { key: "name", label: "Saved name" },
          {
            key: "created_at",
            label: "Saved",
            render: (item) => date(item.created_at),
          },
        ]}
        onOpen={setHistory}
      />
      {history && (
        <Modal
          title={`Saved revision ${history.revision}`}
          onClose={() => setHistory(undefined)}
        >
          <p>
            {String(history.name)} · {date(history.created_at)}
          </p>
          <dl className="portal-facts">
            {Object.entries(history.data ?? {}).map(([key, value]) => (
              <div key={key}>
                <dt><T>{label(key)}</T></dt>
                <dd>
                  {Array.isArray(value)
                    ? value.join(", ")
                    : String(value ?? "Not provided")}
                </dd>
              </div>
            ))}
          </dl>
          <p className="portal-muted">
            <T>{"This immutable snapshot is read only. Edit the current draft to make changes."}</T></p>
        </Modal>
      )}
      {portal === "admin" && (
        <p className="portal-muted">
          <T>{"Use Submissions to review the frozen revision and publish it."}</T></p>
      )}
    </Modal>
  );
}
import { Action } from "./core";
export function RecordActions({
  row,
  onDone,
}: {
  row: Row;
  onDone?: () => void;
}) {
  const { organizationId, portal } = usePortal();
  return (
    <>
      {["draft", "changes_requested"].includes(String(row.status)) && (
        <Action
          action="submit"
          input={{ organizationId, recordId: row.id }}
          onDone={onDone}
        >
          <T>{"Submit"}</T></Action>
      )}
      {row.kind !== "organization" && (
        <Action
          action="duplicate_record"
          input={{ recordId: row.id }}
          onDone={onDone}
        >
          <T>{"Duplicate"}</T></Action>
      )}
      {(!row.published_revision || portal === "admin") && (
        <Action
          action="archive_record"
          onDone={onDone}
          input={{ recordId: row.id, expectedRevision: row.revision }}
          confirm
          danger
        >
          <T>{"Archive"}</T></Action>
      )}
      {portal === "admin" && Boolean(row.published_revision) && (
        <Action
          action="unpublish_record"
          onDone={onDone}
          input={{ recordId: row.id, expectedRevision: row.revision }}
          confirm
        >
          <T>{"Unpublish"}</T></Action>
      )}
    </>
  );
}
export function RecordWorkspace({ kind }: { kind: RecordKind }) {
  const { organizationId } = usePortal();
  const [editing, setEditing] = useState<Row | null | undefined>();
  const [selected, setSelected] = useState<Row>();
  const { data, error } = useResource<{ rows: Row[] }>("provider_records", {
    organizationId,
    kind,
    size: "1",
  });
  if (error) return <ErrorPanel message={error} />;
  return (
    <>
      <ResourceTable
        title={label(kind === "organization" ? "Organization profile" : kind)}
        resource="provider_records"
        params={{ organizationId, kind }}
        columns={
          kind === "package"
            ? [
                { key: "name", label: "Package" },
                {
                  key: "data",
                  label: "Price",
                  render: (row) => <T>{packagePrice({listedPrice:typeof row.data?.price==='number'?row.data.price:undefined,listedPriceMax:typeof row.data?.priceMax==='number'?row.data.priceMax:undefined,currency:typeof row.data?.currency==='string'?row.data.currency:undefined,priceType:String(row.data?.priceType??'not_published')})}</T>,
                },
                {
                  key: "data.durationDays",
                  label: "Duration",
                  render: (row) =>
                    row.data?.durationDays
                      ? `${row.data.durationDays} days`
                      : "Not provided",
                },
                ...commonColumns.slice(1),
              ]
            : commonColumns
        }
        onOpen={setSelected}
        extra={
          (kind !== "organization" || !data?.rows.length) && (
            <button className="portal-button" onClick={() => setEditing(null)}>
              <T>{"Add"}</T>{' '}<T>{label(kind)}</T>
            </button>
          )
        }
      />
      {editing !== undefined && (
        <RecordForm
          kind={kind}
          row={editing ?? undefined}
          onClose={() => setEditing(undefined)}
        />
      )}{" "}
      {selected && (
        <RecordDetails
          row={selected}
          onClose={() => setSelected(undefined)}
          onEdit={(row) => {
            setSelected(undefined);
            setEditing(row);
          }}
        />
      )}
      {kind === "specialty" && <SpecialtyRequest />}
    </>
  );
}
function SpecialtyRequest() {
  const { organizationId, command } = usePortal();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Panel title="Request a new specialty">
      <p>
        <T>{"Requests go to the platform team. A requested specialty cannot be published until it exists in the reviewed canonical catalog."}</T></p>
      <form
        className="portal-inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await command("organization_message", {
              organizationId,
              body: `Canonical specialty request: ${name}`,
            });
            setName("");
          } catch (err) {
            setError(
              String(
                err instanceof Error ? err.message : "Unable to send request.",
              ),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="portal-field">
          <span><T>{"Requested specialty"}</T></span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            maxLength={150}
          />
        </label>
        <button className="portal-button secondary" disabled={busy}>
          <T>{"Send request"}</T></button>
        {error && <p role="alert">{error}</p>}
      </form>
    </Panel>
  );
}
