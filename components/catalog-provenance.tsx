import { LocalDate } from '@/components/experience/translation';
import { T } from '@/components/experience/translation';
import type { CatalogRecord } from "@/types/catalog";
import { publishedReferenceClaims } from "@/lib/catalog/provider-profile";
import { fieldLabel } from "@/lib/catalog/field-label";

export async function CatalogProvenance({ item, kind }: { item: CatalogRecord; kind?: "hospital" | "doctor" | "package" }) {
  const source = item.provenance;
  if (!source) return null;
  const claims = source.origin === "admin_reference" && kind ? await publishedReferenceClaims(kind, item.recordId) : [];
  return <div className="catalog-provenance source-object">
    <p><T>{source.origin === "admin_reference" ? "MedBridge reference information · collected from public sources" : source.origin === "provider_published" ? "Provider-submitted information" : "Reviewed catalog information"}</T>
      {source.sourceName && ` · ${source.sourceName}`}</p>
    {source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer"><T>{"Public source"}</T></a>}
    {source.checkedAt && <p><T>{"Source recorded"}</T>{' '}<LocalDate value={source.checkedAt}/></p>}
    <p><T>{"Publication review does not establish clinical quality or suitability."}</T></p>
    {claims.length > 0 && <details><summary><T>{"Sources for"}</T>{' '}{claims.length} <T>{"published fields"}</T></summary><ul className="reference-public-sources">{claims.map((claim,index)=><li key={index}><strong>{claim.name} · {fieldLabel(claim.field)}</strong><br/><a href={claim.sourceUrl ?? undefined} target="_blank" rel="noreferrer">{claim.sourceName}</a> · {claim.sourceType.replaceAll("_"," ")}<br/><T>{"Collected"}</T>{' '}<LocalDate value={claim.collectedAt}/> · {claim.freshness.replaceAll("_"," ")} <T>{"· claim"}</T>{' '}{claim.status}</li>)}</ul></details>}
  </div>;
}
