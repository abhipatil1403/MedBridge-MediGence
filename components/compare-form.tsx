import { T } from '@/components/experience/translation';
import type { Country, Treatment } from "@/types/catalog";

export function CompareForm({ treatments, countries, procedure = "knee-replacement", countryA = "india", countryB = "turkey" }: {
  treatments: readonly Treatment[]; countries: readonly Country[];
  procedure?: string; countryA?: string; countryB?: string;
}) {
  const unavailable = !treatments.length || countries.length < 2;
  return <form className="compare-form" action="/compare" method="get">
    <label><T>{"Treatment"}</T><select name="procedure" defaultValue={procedure} required>{treatments.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
    <label><T>{"Country A"}</T><select name="countryA" defaultValue={countryA} required>{countries.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
    <label><T>{"Country B"}</T><select name="countryB" defaultValue={countryB} required>{countries.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
    <button type="submit" disabled={unavailable} className="button button--primary button--default"><T>{"Compare countries"}</T></button>
    {unavailable && <p><T>{"Not enough published catalog information is available for a destination comparison yet."}</T></p>}
  </form>;
}
