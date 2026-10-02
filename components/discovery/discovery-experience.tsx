"use client";
import { PageHeader } from "@/components/page-header";

import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DemoNotice } from "@/components/demo-notice";
import { ResultSections } from "@/components/discovery/result-sections";
import { SearchBox } from "@/components/discovery/search-box";
import type { DiscoveryResults, ResultType, SortOption } from "@/types/discovery";

type Facets = {
  specialties: string[];
  countries: { slug: string; name: string }[];
  cities: string[];
  hospitals: { slug: string; name: string }[];
  treatments: { slug: string; name: string }[];
};

const tabs: { key: ResultType; label: string }[] = [
  { key: "all", label: "All" }, { key: "treatments", label: "Treatments" },
  { key: "hospitals", label: "Hospitals" }, { key: "doctors", label: "Doctors" },
  { key: "packages", label: "Packages" }, { key: "countries", label: "Countries" },
  { key: "services", label: "Services" },
];

const filterKeys = ["specialty", "country", "city", "accreditation", "hospital", "mode", "treatment", "budget"] as const;

function FilterControls({ facets, type, params, update, clear }: {
  facets: Facets; type: ResultType; params: URLSearchParams;
  update: (key: string, value: string) => void; clear: () => void;
}) {
  const field = (key: string, label: string, options: { value: string; label: string }[]) => <label className="filter-field" key={key}>
    <span>{label}</span>
    <select value={params.get(key) ?? ""} onChange={(event) => update(key, event.target.value)}>
      <option value="">All {label.toLowerCase()}</option>
      {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
    </select>
  </label>;
  const fields = [];
  if (["all", "treatments", "hospitals", "doctors"].includes(type)) fields.push(field("specialty", "Specialty", facets.specialties.map((name) => ({ value: name, label: name }))));
  if (type !== "services") fields.push(field("country", "Country", facets.countries.map((item) => ({ value: item.slug, label: item.name }))));
  if (type === "hospitals") {
    fields.push(field("city", "City", facets.cities.map((name) => ({ value: name, label: name }))));
    fields.push(field("accreditation", "Accreditation field", [{ value: "sample", label: "Sample credential listed" }, { value: "none", label: "No sample credential" }]));
  }
  if (type === "doctors") {
    fields.push(field("hospital", "Hospital", facets.hospitals.map((item) => ({ value: item.slug, label: item.name }))));
    fields.push(field("mode", "Consultation mode", [{ value: "video", label: "Video" }, { value: "in-person", label: "In person" }]));
  }
  if (["hospitals", "treatments", "packages"].includes(type)) fields.push(field("treatment", "Treatment", facets.treatments.map((item) => ({ value: item.slug, label: item.name }))));
  if (type === "packages") fields.push(field("budget", "Sample budget (USD)", [5000, 10000, 20000, 40000].map((amount) => ({ value: String(amount), label: `Up to $${amount.toLocaleString()}` }))));
  return <div className="filter-controls"><div className="filter-controls__title"><strong>Refine results</strong><button type="button" onClick={clear}>Clear filters</button></div>{fields.length ? fields : <p>No additional filters for this category.</p>}</div>;
}

export function DiscoveryExperience({ facets }: { facets: Facets }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serialized = searchParams.toString();
  const params = new URLSearchParams(serialized);
  const query = params.get("q") ?? "";
  const type = (tabs.some((tab) => tab.key === params.get("type")) ? params.get("type") : "all") as ResultType;
  const [retry, setRetry] = useState(0);
  const requestKey = `${serialized}::${retry}`;
  const [response, setResponse] = useState<{ key: string; results?: DiscoveryResults; error?: string }>({ key: "" });
  const loading = response.key !== requestKey;
  const results = loading ? undefined : response.results;
  const error = loading ? undefined : response.error;
  const [filterOpen, setFilterOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  const filterDialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/discover${serialized ? `?${serialized}` : ""}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Search is unavailable.");
        return body as DiscoveryResults;
      })
      .then((body) => { if (!controller.signal.aborted) setResponse({ key: requestKey, results: body }); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setResponse({ key: requestKey, error: cause instanceof Error ? cause.message : "Search is unavailable." }); });
    return () => controller.abort();
  }, [serialized, requestKey]);

  useEffect(() => {
    if (!filterOpen) return;
    const dialog = filterDialog.current;
    const returnButton = filterButton.current;
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),a[href]') ?? []);
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setFilterOpen(false); }
      if (event.key === "Tab") {
        const items = controls(), first = items[0], last = items.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); returnButton?.focus(); };
  }, [filterOpen]);

  function push(next: URLSearchParams) { router.push(`/discover${next.size ? `?${next}` : ""}`); }
  function update(key: string, value: string) {
    const next = new URLSearchParams(serialized);
    if (value) next.set(key, value); else next.delete(key);
    push(next);
  }
  function changeType(nextType: ResultType) {
    const next = new URLSearchParams();
    if (query) next.set("q", query);
    if (nextType !== "all") next.set("type", nextType);
    push(next);
  }
  function clear() {
    const next = new URLSearchParams(serialized);
    filterKeys.forEach((key) => next.delete(key));
    next.delete("sort");
    push(next);
  }
  function resetError() {
    if (error?.includes("invalid")) clear();
    else setRetry((value) => value + 1);
  }

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "relevance", label: "Relevance" }, { value: "name", label: "Name A–Z" },
    ...(type === "doctors" ? [{ value: "experience" as const, label: "Sample experience" }] : []),
    ...(type === "packages" || type === "treatments" ? [{ value: "price" as const, label: "Sample price: low to high" }] : []),
    ...(type === "hospitals" || type === "doctors" ? [{ value: "location" as const, label: "Location A–Z" }] : []),
  ];

  return <main id="main-content" tabIndex={-1} className="discover-page">
    <div className="container discover-page__intro">
      <PageHeader eyebrow="EXPLORE" title="What are you looking for?" description="Start with a treatment, place or question. Explore the information, then bring the next step into your workspace."><SearchBox key={query} initialQuery={query} label="Search healthcare options" buttonLabel="Explore" /></PageHeader>
      <DemoNotice compact />
    </div>
    <div className="container discover-page__body">
      <nav className="result-tabs" aria-label="Result type">{tabs.map((tab) => <button key={tab.key} type="button" aria-current={type === tab.key ? "page" : undefined} onClick={() => changeType(tab.key)}>{tab.label}</button>)}</nav>
      <div className="discover-toolbar">
        <div><button ref={filterButton} className="mobile-filter-button" type="button" onClick={() => setFilterOpen(true)}><SlidersHorizontal size={17} aria-hidden="true" /> Filters</button><span role="status">{loading ? "Searching…" : error ? "Search unavailable" : `${results?.total ?? 0} sample results`}</span></div>
        <label>Sort by <select value={params.get("sort") ?? "relevance"} onChange={(event) => update("sort", event.target.value)}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <div className="discover-layout">
        <aside className="discover-sidebar" aria-label="Search filters"><FilterControls facets={facets} type={type} params={params} update={update} clear={clear} /></aside>
        <div className="discover-results">
          {results && <div className="search-context" aria-label="Understood search">{results.understanding.entities.procedure && <span>{facets.treatments.find((item) => item.slug === results.understanding.entities.procedure)?.name}</span>}{results.understanding.entities.city && <span>{results.understanding.entities.city}</span>}{results.understanding.entities.country && <span>{facets.countries.find((item) => item.slug === results.understanding.entities.country)?.name}</span>}{results.filters.budget && <span>Budget ≤ USD {results.filters.budget.toLocaleString()}</span>}{query && <Link className="text-link" href={`/assistant?q=${encodeURIComponent(query)}`}>Continue in Care Workspace →</Link>}</div>}
          {loading && <div className="result-state" role="status" aria-live="polite"><h2>Finding relevant options…</h2><p>Checking the sample catalog and current filters.</p><div className="result-skeleton" /><div className="result-skeleton" /><div className="result-skeleton" /></div>}
          {!loading && error && <div className="result-state result-state--error" role="alert"><h2>We couldn’t load these results.</h2><p>{error}</p><button className="button button--primary button--default" type="button" onClick={resetError}>{error.includes("invalid") ? "Reset filters and try again" : "Retry search"}</button></div>}
          {!loading && !error && results?.total === 0 && <div className="result-state"><h2>No exact matches found.</h2><p>Your search is still in the field above. Try a broader term or clear the filters.</p><button className="button button--outline button--default" type="button" onClick={clear}>Try a broader search</button><div className="result-state__suggested"><span>Try:</span><Link href="/discover?q=knee%20replacement">Knee replacement</Link><Link href="/discover?q=second%20opinion">Second opinion</Link><Link href="/discover?q=hospitals%20in%20India">Hospitals in India</Link></div></div>}
          {!loading && !error && results && results.total > 0 && <ResultSections results={results} />}
        </div>
      </div>
    </div>
    {filterOpen && <div className="filter-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFilterOpen(false); }}><div ref={filterDialog} className="filter-drawer" role="dialog" aria-modal="true" aria-label="Search filters"><div className="filter-drawer__head"><strong>Filters</strong><button type="button" onClick={() => { setFilterOpen(false); filterButton.current?.focus(); }} aria-label="Close filters"><X size={21} /></button></div><FilterControls facets={facets} type={type} params={params} update={update} clear={clear} /><button className="button button--primary button--default filter-drawer__done" type="button" onClick={() => setFilterOpen(false)}>View results</button></div></div>}
  </main>;
}
