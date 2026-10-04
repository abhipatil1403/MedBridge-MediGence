import type { CatalogRecord } from "@/types/catalog";

export function CatalogProvenance({ item }: { item: CatalogRecord }) {
  const source = item.provenance;
  if (!source) return null;
  return <div className="catalog-provenance">
    <p>{source.origin === "provider_published" ? "Published provider information" : "Reviewed catalog information"}
      {source.sourceName && ` · ${source.sourceName}`}</p>
    {source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">Public source</a>}
    {source.checkedAt && <p>Source recorded {new Date(source.checkedAt).toLocaleDateString("en-IN", { timeZone: "UTC" })}</p>}
    <p>Publication review does not establish clinical quality or suitability.</p>
  </div>;
}
