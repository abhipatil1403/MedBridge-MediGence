"use client";
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
}: {
  action: string;
  input?: Record<string, unknown>;
  fields: Field[];
  initial?: Record<string, unknown>;
  submit?: string;
  onDone?: (row: Row) => void;
}) {
  const { command } = usePortal();
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
          const row = await command(action, { ...input, ...data });
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
        {fields.map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            register={form.register}
            defaultValue={initial[field.key]}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="portal-field-error">
          {error}
        </p>
      )}
      <button className="portal-button" disabled={busy}>
        {busy ? "Saving…" : submit}
      </button>
    </form>
  );
}
