import type { CatalogRecord } from "@/types/catalog";
import { publishedReferenceClaims } from "@/lib/catalog/provider-profile";
import { fieldLabel } from "@/lib/catalog/field-label";

export async function CatalogProvenance({ item, kind }: { item: CatalogRecord; kind?: "hospital" | "doctor" | "package" }) {
  const source = item.provenance;
  if (!source) return null;
  const claims = source.origin === "admin_reference" && kind ? await publishedReferenceClaims(kind, item.recordId) : [];
  return <div className="catalog-provenance">
    <p>{source.origin === "admin_reference" ? "MedBridge reference information · collected from public sources" : source.origin === "provider_published" ? "Provider-submitted information" : "Reviewed catalog information"}
      {source.sourceName && ` · ${source.sourceName}`}</p>
    {source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">Public source</a>}
    {source.checkedAt && <p>Source recorded {new Date(source.checkedAt).toLocaleDateString("en-IN", { timeZone: "UTC",dateStyle:"medium" })}</p>}
    <p>Publication review does not establish clinical quality or suitability.</p>
    {claims.length > 0 && <details><summary>Sources for {claims.length} published fields</summary><ul className="reference-public-sources">{claims.map((claim,index)=><li key={index}><strong>{claim.name} · {fieldLabel(claim.field)}</strong><br/><a href={claim.sourceUrl ?? undefined} target="_blank" rel="noreferrer">{claim.sourceName}</a> · {claim.sourceType.replaceAll("_"," ")}<br/>Collected {new Date(claim.collectedAt).toLocaleDateString("en-IN",{timeZone:"UTC",dateStyle:"medium"})} · {claim.freshness.replaceAll("_"," ")} · claim {claim.status}</li>)}</ul></details>}
  </div>;
}
