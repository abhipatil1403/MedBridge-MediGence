import { T } from './experience/translation';
import type { SearchService } from '@/lib/discovery/search-service';
export function DirectoryFilters({type,facets}:{type:string;facets:Awaited<ReturnType<SearchService['facets']>>}){
 const fields=[...(type!=='packages'?[{key:'specialty',label:'Specialty',items:facets.specialties.map(name=>({value:name,label:name}))}]:[]),{key:'city',label:'Location',items:facets.cities.map(name=>({value:name,label:name}))},...(type==='doctors'?[{key:'hospital',label:'Hospital',items:facets.hospitals.map(h=>({value:h.slug,label:h.name}))}]:[]),...(type==='packages'?[{key:'treatment',label:'Treatment',items:facets.treatments.map(t=>({value:t.slug,label:t.name}))}]:[])];
 return <form className="directory-filters" action="/discover"><input type="hidden" name="type" value={type}/>{fields.filter(field=>field.items.length>0).map(field=><label key={field.key}><T>{field.label}</T><select name={field.key}><option value=""><T>{'All'}</T></option>{field.items.map(item=><option value={item.value} key={item.value}>{item.label}</option>)}</select></label>)}<button className="button button--outline" type="submit"><T>{'Refine results'}</T> →</button></form>;
}
