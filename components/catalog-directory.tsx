import { DemoNotice } from "@/components/demo-notice";
import { ResultSections } from "@/components/discovery/result-sections";
import { SearchBox } from "@/components/discovery/search-box";
import { searchService } from "@/lib/discovery/search-service";
import type { ResultType } from "@/types/discovery";
import { PageHeader } from './page-header';

export async function CatalogDirectory({ type, title, description }: { type: Exclude<ResultType, "all">; title: string; description: string }) {
  const results = await searchService.search({ q: "", type, sort: "name" });
  return <main id="main-content" tabIndex={-1} className="directory-page container"><PageHeader eyebrow="MEDBRIDGE DISCOVERY" title={title} description={description}><SearchBox label={`Search ${type}`} /></PageHeader><DemoNotice compact /><div className="directory-page__toolbar"><span>{results.total} sample {type}</span><a className="text-link" href={`/discover?type=${type}`}>Filter results →</a></div><ResultSections results={results} limit={100} /></main>;
}
