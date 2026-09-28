import type { CatalogKind } from "@/types/catalog";
import type { Matched, ParsedQuery, SortOption } from "@/types/discovery";
import { normalize } from "./normalize";

const intentKinds: Record<ParsedQuery["intent"], CatalogKind | null> = {
  treatment: "treatments", hospital: "hospitals", doctor: "doctors", comparison: "countries",
  "second-opinion": "services", consultation: "services", package: "packages", travel: "services",
  recovery: "services", "general-discovery": null,
};

export const SearchRankingService = {
  score(kind: CatalogKind, item: { name: string; slug: string; aliases: readonly string[] }, parsed: ParsedQuery, details: { specialty?: string; country?: string; treatmentSlugs?: readonly string[]; searchText?: string } = {}): number {
    if (!parsed.query) return 1;
    const title = normalize(item.name);
    const fullText = normalize([item.name, ...item.aliases, details.specialty ?? "", details.country ?? "", details.searchText ?? ""].join(" "));
    let score = 0;
    if (title === normalize(parsed.query)) score += 20;
    if (item.aliases.some((alias) => normalize(alias) === normalize(parsed.query))) score += 16;
    for (const token of parsed.tokens) {
      if (` ${title} `.includes(` ${token} `)) score += 5;
      else if (` ${fullText} `.includes(` ${token} `)) score += 2;
    }
    if (parsed.entities.procedure && (item.slug === parsed.entities.procedure || details.treatmentSlugs?.includes(parsed.entities.procedure))) score += 12;
    if (parsed.entities.specialty && details.specialty === parsed.entities.specialty) score += 4;
    if (parsed.entities.countries.includes(details.country ?? "")) score += 3;
    if (parsed.entities.service && item.slug === parsed.entities.service) score += 12;
    if (intentKinds[parsed.intent] === kind && (score > 0 || parsed.tokens.length === 0)) score += 3;
    return score;
  },

  reason(kind: CatalogKind, parsed: ParsedQuery, details: { country?: string; treatmentSlugs?: readonly string[]; specialty?: string } = {}): string {
    if (!parsed.query) return "Browse this sample record.";
    if (parsed.entities.procedure && details.treatmentSlugs?.includes(parsed.entities.procedure)) return "Related to the treatment in your search.";
    if (parsed.entities.procedure && kind === "treatments") return "Matches the treatment in your search.";
    if (parsed.entities.specialty && details.specialty === parsed.entities.specialty) return `Matches ${parsed.entities.specialty.toLowerCase()} in your search.`;
    if (details.country && parsed.entities.countries.includes(details.country)) return "Matches the destination in your search.";
    if (kind === "services") return "Matches the care service in your search.";
    return "Matches terms in your search.";
  },

  sort<T extends { name: string }>(items: Matched<T>[], sort: SortOption, value: (item: T, key: SortOption) => number | string | undefined): Matched<T>[] {
    return [...items].sort((a, b) => {
      if (sort === "relevance") return b.score - a.score || a.item.name.localeCompare(b.item.name);
      if (sort === "name") return a.item.name.localeCompare(b.item.name);
      const first = value(a.item, sort);
      const second = value(b.item, sort);
      if (typeof first === "number" && typeof second === "number") return (sort === "experience" ? second - first : first - second) || a.item.name.localeCompare(b.item.name);
      if (typeof first === "string" && typeof second === "string") return first.localeCompare(second) || a.item.name.localeCompare(b.item.name);
      return b.score - a.score || a.item.name.localeCompare(b.item.name);
    });
  },
};
