// Export ONLY seeded catalog rows for historical model/persistence tests.
// No auth, organization, patient, review or document data may be exported.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const name = process.env.MEDBRIDGE_FIXTURE_DB ?? "production_catalog_20261004";
const output = process.env.MEDBRIDGE_CATALOG_FIXTURE;
if (!/^production_catalog_[a-z0-9_]+$/.test(name) || !output) throw new Error("Disposable database name and MEDBRIDGE_CATALOG_FIXTURE path required");
function query(sql) { return execFileSync("psql", ["-w", "-h", "127.0.0.1", "-p", "55432", "-U", "postgres", "-d", name, "-Atc", sql], { encoding: "utf8" }).trim(); }
if (query("select count(*) from public.provider_records") !== "0") throw new Error("Only pristine seeded databases may be exported");
const tables = ["countries", "cities", "specialties", "treatments", "treatment_countries", "hospitals", "hospital_specialties", "hospital_treatments", "doctors", "doctor_specialties", "doctor_treatments", "hospital_doctors", "packages", "package_inclusions", "package_exclusions", "healthcare_services", "price_estimates"];
const fixture = Object.fromEntries(tables.map(table => [table, JSON.parse(query(`select coalesce(json_agg(t),'[]'::json) from public.${table} t`))]));
for (const table of ["countries", "specialties", "treatments", "hospitals", "doctors", "packages", "healthcare_services", "price_estimates"]) {
  if (fixture[table].some(row => row.source_kind !== "synthetic")) throw new Error("Only synthetic fixture data may be exported");
}
// Remote persistence retains a treatment foreign key. Align only synthetic
// treatment identifiers, using a read-only server query; no provider, source,
// patient or private information is copied into this local fixture.
let serialized = JSON.stringify(fixture);
if (process.argv.includes("--align-persistence")) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const result = await db.from("treatments").select("id,slug").eq("source_kind", "synthetic");
  if (result.error) throw new Error("Synthetic persistence identifier lookup failed");
  for (const row of fixture.treatments) {
    const remote = result.data.find(entry => entry.slug === row.slug);
    if (!remote) throw new Error("Synthetic treatment identifier missing for persistence regression");
    serialized = serialized.replaceAll(row.id, remote.id);
  }
}
writeFileSync(output, serialized);
console.log("Isolated synthetic catalog fixture exported; no private data included.");
