import { DemoNotice } from "@/components/demo-notice";
import { ResultSections } from "@/components/discovery/result-sections";
import { SearchBox } from "@/components/discovery/search-box";
import { searchService } from "@/lib/discovery/search-service";
import type { ResultType } from "@/types/discovery";

export async function CatalogDirectory({ type, title, description }: { type: Exclude<ResultType, "all">; title: string; description: string }) {
  const results = await searchService.search({ q: "", type, sort: "name" });
  return <main id="main-content" className="directory-page container"><div className="directory-page__head"><p className="eyebrow">MEDBRIDGE DISCOVERY</p><h1>{title}</h1><p>{description}</p><SearchBox label={`Search ${title.toLowerCase()}`} /></div><DemoNotice compact /><div className="directory-page__toolbar"><span>{results.total} sample records</span><a className="text-link" href={`/discover?type=${type}`}>Open filters →</a></div><ResultSections results={results} limit={100} /></main>;
}
