import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import { DemoNotice } from "@/components/demo-notice";
import { ResultSections } from "@/components/discovery/result-sections";
import { SearchBox } from "@/components/discovery/search-box";
import { searchService } from "@/lib/discovery/search-service";
import type { ResultType } from "@/types/discovery";
import { PageHeader } from "./page-header";
import { Suspense } from 'react';
import { DirectoryFilters } from './directory-filters';
import {catalogRepository} from '@/lib/catalog/repository';

export function CatalogDirectory({
  type,
  title,
  description,
}: {
  type: Exclude<ResultType, "all">;
  title: string;
  description: string;
}) {
  return <main id="main-content" tabIndex={-1} data-page-content className={`directory-page directory-page--${type} container`}>
    <div className="directory-intro"><PageHeader eyebrow={type.toUpperCase()} title={title} description={description}/><div className="directory-intro__aside"><SearchBox label={`Search ${type}`} resultType={type}/></div></div>
    <Suspense fallback={<div className="directory-loading" data-secondary-loading={type} aria-busy="true"><div className="skeleton-tabs"><span/><span/><span/></div><div className="skeleton-results">{[1,2,3,4].map(i=><div className="skeleton-result" key={i}><div className="skeleton-line skeleton-line--wide"/><div className="skeleton-line"/></div>)}</div></div>}><DirectoryResults type={type}/></Suspense>
  </main>;
}
async function DirectoryResults({type}:{type:Exclude<ResultType,'all'>}) {
  const [results,facets,catalog] = await Promise.all([searchService.search({ q: "", type, sort: "name" }),searchService.facets(),catalogRepository.loadSnapshot!()]);
  const onlySynthetic = results.sections[type].length > 0 && results.sections[type].every(({ item }) => item.demo);
  const categories = [
    ...new Set(results.sections.treatments.map(({ item }) => item.specialty)),
  ];
  return (
    <div data-directory-results={type}>
      <DirectoryFilters type={type} facets={facets}/>
      {type === "treatments" && (
        <Localized as="nav" className="category-index" aria-label="Treatment specialties">
          {categories.map((category) => (
            <a
              key={category}
              href={`/discover?type=treatments&specialty=${encodeURIComponent(category)}`}
            >
              {category}
            </a>
          ))}
        </Localized>
      )}
      <div className="directory-page__toolbar">
        <div>
          {onlySynthetic ? (
            <DemoNotice compact />
          ) : (
            <p className="muted">
              <T>{"Listings use reviewed, published information. Check their sources and confirm current details with the provider."}</T></p>
          )}
        </div>
        <a className="text-link" href={`/discover?type=${type}`}>
          <T>{"Refine your options →"}</T></a>
      </div>
      {results.sections[type].length === 0 && (
        <Localized as="section" className="catalog-empty" aria-label="No published listings">
          <h2><T>{"No published"}</T>{' '}<T>{type}</T>{' '}<T>{"are available yet."}</T></h2>
          <p><T>{"Try another location or treatment as reviewed listings become available."}</T></p>
          <a className="text-link" href="/help"><T>{"Get coordination support →"}</T></a>
        </Localized>
      )}
      {type === "treatments" ? (
        <div className="treatment-categories">
          {categories.map((category, index) => (
            <section key={category} className="treatment-category">
              <h2>{category}</h2>
              <ResultSections
                idPrefix={`category-${index}-`}
                results={{
                  ...results,
                  sections: {
                    ...results.sections,
                    treatments: results.sections.treatments.filter(
                      ({ item }) => item.specialty === category,
                    ),
                  },
                }}
                catalog={catalog}
                limit={100}
              />
            </section>
          ))}
        </div>
      ) : (
        <ResultSections results={results} limit={100} catalog={catalog}/>
      )}
    </div>
  );
}
