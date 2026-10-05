import { T } from './experience/translation';
import { MedBridgeLogo } from './medbridge-logo';
type Kind='doctors'|'hospitals'|'treatments'|'packages'|'discover'|'compare'|'account'|'recover'|'assistant'|'help'|'home';
const titles:Record<Kind,string>={doctors:'Find a specialist',hospitals:'Explore hospitals',treatments:'Explore treatments',packages:'Explore published packages',discover:'What are you looking for?',compare:'Compare healthcare options side by side.',account:'Your account',recover:'Lifetime Recover',assistant:'MedBridge AI',help:'My support requests',home:'A clearer path through care'};
export function RouteSkeleton({kind='home',detail=false}:{kind?:Kind;detail?:boolean}){
  return <main id="main-content" className={`container route-skeleton route-skeleton--${kind}`} data-route-loading={kind} aria-busy="true" aria-label={`${titles[kind]} — loading`}>
    <p className="sr-only" role="status"><T>{'Preparing your page'}</T></p>{['account','assistant','help','home'].includes(kind)&&<MedBridgeLogo compact/>}
    <div className="skeleton-breadcrumb" aria-hidden="true"><span className="skeleton-line"/><span className="skeleton-line"/></div>
    <header className="skeleton-heading">{!detail?<><p className="eyebrow">{kind==='assistant'?'MEDBRIDGE AI':kind.toUpperCase()}</p><h1><T>{titles[kind]}</T></h1></>:<><div className="skeleton-line skeleton-line--title"/><div className="skeleton-line skeleton-line--wide"/></>}</header>
    <div aria-hidden="true">
      {detail?<><div className="skeleton-profile"><div className="skeleton-avatar"/><div><div className="skeleton-line skeleton-line--title"/><div className="skeleton-line"/><div className="skeleton-line"/></div></div><div className="skeleton-tabs"><span/><span/><span/><span/></div><div className="skeleton-detail"><div>{['Overview',kind==='packages'?'Pricing and inclusions':'Published information','Related options'].map(label=><section key={label}><h2>{label}</h2><div className="skeleton-line skeleton-line--wide"/><div className="skeleton-line"/></section>)}</div><aside><div className="skeleton-line"/><div className="skeleton-line"/></aside></div></>:
      ['account','recover','help'].includes(kind)?<div className="skeleton-personal"><aside>{[1,2,3,4].map(i=><div className="skeleton-line" key={i}/>)}</aside><section>{[1,2,3,4].map(i=><div className="skeleton-input" key={i}/>)}</section></div>:
      kind==='assistant'?<div className="skeleton-ai"><div className="skeleton-line skeleton-line--wide"/><div className="skeleton-input"/><div className="skeleton-tabs"><span/><span/><span/></div></div>:
      <><div className="skeleton-input"/><div className="skeleton-tabs"><span/><span/><span/></div><div className={`skeleton-results ${kind==='treatments'?'skeleton-results--rows':''}`}>{[1,2,3,4].map(i=><div className="skeleton-result" key={i}>{kind==='doctors'&&<div className="skeleton-avatar"/>}<div className="skeleton-line skeleton-line--wide"/><div className="skeleton-line"/><div className="skeleton-line"/></div>)}</div></>}
    </div>
  </main>;
}
