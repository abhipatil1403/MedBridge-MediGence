import { T } from './experience/translation';
export function InlineSkeleton({kind='form'}:{kind?:'form'|'journey'}){
  return <div className={`inline-skeleton inline-skeleton--${kind}`} aria-busy="true" data-secondary-loading><span className="sr-only" role="status"><T>{'Preparing your information'}</T></span><div aria-hidden="true">{[1,2,3].map(i=><div key={i} className="skeleton-input"/>)}</div></div>;
}
