"use client";
import { T } from '@/components/experience/translation';
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Field, Row } from "@/lib/portals/config";
import { FieldControl } from "./record-form";
import { usePortal } from "./core";
const schema = z.object({
  name: z.string(),
  values: z.record(
    z.string(),
    z.union([z.string().max(10000), z.boolean(), z.array(z.string())]),
  ),
});
export function CommandForm({
  action,
  input = {},
  fields,
  initial = {},
  submit = "Save changes",
  onDone,
  advancedKeys=[],
}: {
  action: string;
  input?: Record<string, unknown>;
  fields: Field[];
  initial?: Record<string, unknown>;
  submit?: string;
  onDone?: (row: Row) => void;
  advancedKeys?:string[];
}) {
  const { command } = usePortal();
  const [operation, setOperation] = useState<{payload: string; id: string} | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      values: Object.fromEntries(
        fields.map((field) => [
          field.key,
          field.type === "checkbox"
            ? Boolean(initial[field.key])
            : field.type === "list" && field.catalog
              ? Array.isArray(initial[field.key])
                ? (initial[field.key] as string[])
                : []
              : Array.isArray(initial[field.key])
                ? (initial[field.key] as string[]).join("\n")
                : String(initial[field.key] ?? ""),
        ]),
      ),
    },
  });
  return (
    <form
      className="portal-form"
      onSubmit={form.handleSubmit(async (values) => {
        setBusy(true);
        setError("");
        try {
          const data = Object.fromEntries(
            fields.map((field) => [
              field.key,
              field.type === "number" && values.values[field.key] !== ""
                ? Number(values.values[field.key])
                : field.type === "list"
                  ? Array.isArray(values.values[field.key])
                    ? values.values[field.key]
                    : String(values.values[field.key])
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean)
                  : values.values[field.key],
            ]),
          );
          const payload = { ...input, ...data };
          const idempotent = action.startsWith("operations_") || ["submit_organization_verification", "review_organization_verification", "assign_listing_ownership", "revoke_listing_ownership", "create_organization", "invite_member", "update_member", "organization_status"].includes(action);
          if (idempotent) {
            const key = JSON.stringify(payload);
            const current = operation?.payload === key ? operation : {payload:key, id:crypto.randomUUID()};
            setOperation(current);
            payload.operationId = current.id;
          }
          const row = await command(action, payload);
          setOperation(null);
          form.reset();
          onDone?.(row);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Unable to save this change.",
          );
        } finally {
          setBusy(false);
        }
      })}
    >
      <div className="portal-form-grid">
        {fields.filter(field=>!advancedKeys.includes(field.key)).map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            register={form.register}
            defaultValue={initial[field.key]}
          />
        ))}
      </div>
      {advancedKeys.length>0&&<details className="privacy-sharing"><summary><T>{'Privacy & sharing'}</T></summary><div className="portal-form-grid">{fields.filter(field=>advancedKeys.includes(field.key)).map(field=><FieldControl key={field.key} field={field} register={form.register} defaultValue={initial[field.key]}/>)}</div></details>}
      {error && (
        <p role="alert" className="portal-field-error">
          <T>{error}</T>
        </p>
      )}
      <button className="portal-button" disabled={busy}>
        <T>{busy ? "Saving…" : submit}</T>
      </button>
    </form>
  );
}
