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
import { parseDiscoveryFilters } from '@/lib/discovery/filters';
import Link from '@/components/catalog-link';
import { packagePriceBounds } from '@/lib/catalog/pricing';
export type DirectoryParams=Promise<Record<string,string|string[]|undefined>>;
function filtersFromParams(raw:Record<string,string|string[]|undefined>,type:Exclude<ResultType,'all'>) {
 const params=new URLSearchParams();
 for(const [key,value] of Object.entries(raw))if(typeof value==='string'&&value)params.set(key,value);
 params.set('type',type);
 if(!params.has('sort'))params.set('sort','name');
 return parseDiscoveryFilters(params);
}

export function CatalogDirectory({
  type,
  title,
  description,
  searchParams=Promise.resolve({}),
}: {
  type: Exclude<ResultType, "all">;
  title: string;
  description: string;
  searchParams?:DirectoryParams;
}) {
  return <main id="main-content" tabIndex={-1} data-page-content className={`directory-page directory-page--${type} container`}>
    <div className="directory-intro"><PageHeader eyebrow={type.toUpperCase()} title={title} description={description}/><div className="directory-intro__aside"><Suspense fallback={<div className="skeleton-line skeleton-line--wide"/>}><DirectorySearch type={type} searchParams={searchParams}/></Suspense></div></div>
    <Suspense fallback={<div className="directory-loading" data-secondary-loading={type} aria-busy="true"><div className="skeleton-tabs"><span/><span/><span/></div><div className="skeleton-results">{[1,2,3,4].map(i=><div className="skeleton-result" key={i}><div className="skeleton-line skeleton-line--wide"/><div className="skeleton-line"/></div>)}</div></div>}><DirectoryResults type={type} searchParams={searchParams}/></Suspense>
  </main>;
}
async function DirectorySearch({type,searchParams}:{type:Exclude<ResultType,'all'>;searchParams:DirectoryParams}) {
 const raw=await searchParams;
 return <SearchBox key={typeof raw.q==='string'?raw.q:''} initialQuery={typeof raw.q==='string'?raw.q:''} label={`Search ${type}`} resultType={type} destination={`/${type}`}/>;
}
async function DirectoryResults({type,searchParams}:{type:Exclude<ResultType,'all'>;searchParams:DirectoryParams}) {
  const filters=filtersFromParams(await searchParams,type);
  const [results,facets,catalog] = await Promise.all([searchService.search(filters),searchService.facets(),catalogRepository.loadSnapshot!()]);
  // Compare original prices only within their currency; search and agent contracts stay unchanged.
  const displayResults=type==='packages'&&filters.sort==='price'?{...results,sections:{...results.sections,packages:[...results.sections.packages].sort((a,b)=>{
    const first=packagePriceBounds(a.item),second=packagePriceBounds(b.item);
    if(!first&&!second)return a.item.name.localeCompare(b.item.name);
    if(!first)return 1;
    if(!second)return -1;
    return first.currency.localeCompare(second.currency)||first.min-second.min||a.item.name.localeCompare(b.item.name);
  })}}:results;
  const onlySynthetic = results.sections[type].length > 0 && results.sections[type].every(({ item }) => item.demo);
  const categories = [
    ...new Set(results.sections.treatments.map(({ item }) => item.specialty)),
  ];
  return (
    <div data-directory-results={type}>
      <details className="directory-filter-disclosure"><summary><T>{'Filters'}</T></summary><DirectoryFilters type={type} facets={facets} filters={filters}/></details>
      {type === "treatments" && (
        <Localized as="nav" className="category-index" aria-label="Treatment specialties">
          {categories.map((category) => (
            <a
              key={category}
              href={`/treatments?specialty=${encodeURIComponent(category)}`}
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
              <strong className="directory-results-count">{results.sections[type].length} <T>{results.sections[type].length===1?'published option':'published options'}</T></strong></p>
          )}
        </div>
        <Link className="text-link" href={`/assistant?q=${encodeURIComponent(`Help me explore ${type}${filters.q?` for ${filters.q}`:''}${filters.city?` in ${filters.city}`:''}.`)}`}><T>{'Help me choose what to explore'}</T> →</Link>
      </div>
      {results.sections[type].length === 0 && (
        <Localized as="section" className="catalog-empty" aria-label="No published listings">
          <h2><T>{'No published options match these filters.'}</T></h2>
          <p><T>{"Try another location or treatment as reviewed listings become available."}</T></p>
          <div className="catalog-empty__actions"><Link className="button button--outline" href={`/${type}`}><T>{'Clear filters'}</T></Link><Link className="text-link" href={type==='hospitals'?'/doctors':'/hospitals'}><T>{type==='hospitals'?'Explore doctors':'Explore hospitals'}</T> →</Link><Link className="text-link" href="/assistant"><T>{'Ask MedBridge AI'}</T> →</Link></div>
        </Localized>
      )}
      {type==='packages'&&filters.sort==='price'&&<p className="muted"><T>{'Prices are ordered within each listed currency. Amounts in different currencies are not directly comparable.'}</T></p>}
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
        <ResultSections results={displayResults} limit={100} catalog={catalog}/>
      )}
    </div>
  );
}
