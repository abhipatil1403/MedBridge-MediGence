"use client";
import { Localized } from '@/components/experience/localized';


import { T } from '@/components/experience/translation';
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import type { SearchSuggestion } from "@/types/discovery";

export function SearchBox({ initialQuery = "", label = "Describe your need", buttonLabel = "Search", prominent = false }: {
  initialQuery?: string; label?: string; buttonLabel?: string; prominent?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const listId = useId();

  useEffect(() => {
    if (!focused || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/discover/suggestions?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Suggestions unavailable");
        const data = (await response.json()) as { suggestions: SearchSuggestion[] };
        setSuggestions(data.suggestions);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, focused]);

  function submit(value: string, type?: SearchSuggestion["type"]) {
    setFocused(false);
    const params = new URLSearchParams();
    if (value.trim()) params.set("q", value.trim());
    if (type && type !== "all") params.set("type", type);
    router.push(`/discover${params.size ? `?${params}` : ""}`);
  }

  return <div className={prominent ? "search-box search-box--prominent" : "search-box"}>
    <form role="search" onSubmit={(event) => { event.preventDefault(); submit(query); }}>
      <label htmlFor={listId}><T>{label}</T></label>
      <div className="search-box__control">
        <Search size={21} aria-hidden="true" />
        <Localized as="input" id={listId} value={query} onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)} onKeyDown={(event) => { if (event.key === "Escape") setFocused(false); }}
          placeholder="Treatment, specialty, place or question…" autoComplete="off" maxLength={240} />
        <button className="button button--primary button--default" type="submit"><T>{buttonLabel}</T></button>
      </div>
    </form>
    {focused && query.trim().length >= 2 && (loading || suggestions.length > 0) && <Localized as="div" className="search-box__suggestions" aria-label="Search suggestions">
      <p><T>{loading ? "Finding suggestions…" : "Suggested searches"}</T></p>
      {!loading && <ul>{suggestions.map((suggestion) => <li key={`${suggestion.type}-${suggestion.label}`}>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => submit(suggestion.query, suggestion.type)}>
          <span>{suggestion.label}</span><small><T>{suggestion.kind}</T></small>
        </button>
      </li>)}</ul>}
    </Localized>}
  </div>;
}
