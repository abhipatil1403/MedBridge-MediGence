import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import type { Database } from "@/types/database";

// Historical model/persistence regressions intentionally use synthetic seed
// fixtures. Their catalog is an explicit file fixture, never the
// hosted public catalog. Production anonymous RLS has its own integration gate.
export function getIsolatedFixtureClient() {
  const path = process.env.MEDBRIDGE_CATALOG_FIXTURE;
  if (!path) throw new Error("Live regressions require MEDBRIDGE_CATALOG_FIXTURE exported from a disposable local database.");
  const fixture = JSON.parse(readFileSync(path, "utf8")) as Record<string, Array<{ slug: string; source_kind?: string }>>;
  const kinds = ["treatments", "hospitals", "doctors", "packages", "countries", "healthcare_services"];
  if (kinds.some(kind => fixture[kind]?.some(row => row.source_kind !== "synthetic"))) throw new Error("Only isolated synthetic fixtures are allowed");
  return {
    from: (table: string) => ({ select: async () => ({ data: fixture[table] ?? [], error: null }) }),
    rpc: async (name: string) => ({ data: name === "search_catalog_candidates"
      ? kinds.flatMap(kind => (fixture[kind] ?? []).map(row => ({ kind: kind === "healthcare_services" ? "services" : kind, slug: row.slug })))
      : [], error: null }),
  } as unknown as SupabaseClient<Database>;
}
