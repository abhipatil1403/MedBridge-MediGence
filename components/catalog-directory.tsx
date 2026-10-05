import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import { DemoNotice } from "@/components/demo-notice";
import { ResultSections } from "@/components/discovery/result-sections";
import { SearchBox } from "@/components/discovery/search-box";
import { searchService } from "@/lib/discovery/search-service";
import type { ResultType } from "@/types/discovery";
import { PageHeader } from "./page-header";

export async function CatalogDirectory({
  type,
  title,
  description,
}: {
  type: Exclude<ResultType, "all">;
  title: string;
  description: string;
}) {
  const results = await searchService.search({ q: "", type, sort: "name" });
  const guidance: Record<string, string> = {
    treatments:
      "Start with a treatment area. Explore related providers and destinations from each topic.",
    hospitals:
      "Explore specialties and relationships. Open a profile to inspect what is known and what needs confirmation.",
    doctors:
      "Find a specialty and explore the associated hospital. Inspect the profile’s provenance and evidence; appointment availability requires confirmation.",
    packages:
      "Look at the estimate together with inclusions and exclusions. Listed estimates are not current provider quotes.",
  };
  const onlySynthetic = results.sections[type].length > 0 && results.sections[type].every(({ item }) => item.demo);
  const categories = [
    ...new Set(results.sections.treatments.map(({ item }) => item.specialty)),
  ];
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`directory-page directory-page--${type} container`}
    >
      <div className="directory-intro">
        <PageHeader
          eyebrow={
            type === "packages" ? "PLAN · PACKAGES" : `EXPLORE · ${type}`
          }
          title={title}
          description={description}
        />
        <div className="directory-intro__aside">
          <SearchBox label={`Search ${type}`} />
          <p><T>{guidance[type]}</T></p>
        </div>
      </div>
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
                limit={100}
              />
            </section>
          ))}
        </div>
      ) : (
        <ResultSections results={results} limit={100} />
      )}
    </main>
  );
}
