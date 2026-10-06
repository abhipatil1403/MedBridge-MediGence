import { Suspense } from 'react';
import { ArrowRight, ArrowUpRight, BookOpenCheck } from 'lucide-react';
import Link from '@/components/catalog-link';
import { T } from '@/components/experience/translation';
import { PackagePrice } from '@/components/experience/package-price';
import { PersonalSummary } from '@/components/experience/personal-summary';
import { SearchPrompt } from '@/components/search-prompt';
import { JourneyArt } from '@/components/visual/journey-art';
import { IdentityArt } from '@/components/visual/identity-art';
import { TreatmentExplorer } from '@/components/visual/treatment-explorer';
import { getHomepageCatalog } from '@/lib/catalog/homepage-service';

export const dynamic = 'force-dynamic';
const exampleQuestion = 'Show health checkup packages in Pune under ₹10,000.';

export default function Home() {
  return <main id="main-content" tabIndex={-1} className="home-page home-page--visual4">
    <section className="home-hero container" aria-labelledby="home-title">
      <div className="home-hero__conversation">
        <p className="home-hero__identity"><span aria-hidden="true"/><T>{'Healthcare navigation, powered by AI.'}</T></p>
        <h1 id="home-title"><T>{'Your question.'}</T><br/><em><T>{'A clearer way forward.'}</T></em></h1>
        <p className="home-hero__lead"><T>{'Find healthcare options. Understand the details. Organize your next step.'}</T></p>
        <SearchPrompt id="home-request" label="Ask MedBridge AI" suggestions/>
        <p className="home-hero__trust"><BookOpenCheck size={16} aria-hidden="true"/><T>{'Published information. Sources you can inspect.'}</T></p>
      </div>
      <JourneyArt/>
    </section>
    <PersonalSummary/>
    <Suspense fallback={<div className="container home-catalog-skeleton" aria-busy="true"><div className="skeleton-line skeleton-line--title"/><div className="skeleton-results"><div className="skeleton-result"/><div className="skeleton-result"/></div></div>}><HomeCatalog/></Suspense>
    <section className="home-continuity container" aria-labelledby="continuity-title">
      <div className="home-continuity__intro"><p className="section-note"><T>{'Plan → Treat → Recover'}</T></p><h2 id="continuity-title"><T>{'Care has a next chapter.'}</T></h2><p><T>{'Keep the practical details together before, during and after treatment. Your journey stays yours.'}</T></p><Link className="text-link" href="/recover"><T>{'Organize your journey'}</T><ArrowRight size={18} aria-hidden="true"/></Link><small><T>{'Your clinician guides medical care.'}</T></small></div>
      <div className="home-continuity__path">{[
        ['01','Plan','Explore hospitals, doctors, treatments and packages.','/discover'],
        ['02','Treat','Providers. Packages. Documents. Support.','/packages'],
        ['03','Recover','Your tasks, milestones and practical next steps.','/recover'],
      ].map(([number,title,copy,href])=><Link href={href} key={title}><span>{number}</span><div><h3><T>{title}</T></h3><p><T>{copy}</T></p></div><ArrowUpRight size={20} aria-hidden="true"/></Link>)}</div>
    </section>
    <section className="home-evidence container" aria-labelledby="trust-title"><div><span className="home-evidence__symbol" aria-hidden="true">↗</span><h2 id="trust-title"><T>{'Know what we know.'}</T><br/><em><T>{'See what needs confirmation.'}</T></em></h2></div><div className="home-evidence__notes"><p><T>{'Published options include their source and the details that still need provider confirmation.'}</T></p><details><summary><T>{'How we handle information'}</T></summary><p><T>{'Listings are reviewed before publication. Publication does not establish clinical quality. Public source research is identified separately, and medical decisions stay with a qualified professional.'}</T></p></details><Link className="text-link" href="/help"><T>{'Get help with the next step'}</T><ArrowRight size={18} aria-hidden="true"/></Link></div></section>
    <section className="home-final container" aria-labelledby="final-title"><h2 id="final-title"><T>{'Start with what you know.'}</T><br/><em><T>{'We’ll help with the next question.'}</T></em></h2><SearchPrompt id="final-request" compact/></section>
  </main>;
}

async function HomeCatalog() {
  const { treatments, hospitals, doctors, packages } = await getHomepageCatalog();
  const example = packages.find(item => item.city?.toLowerCase() === 'pune');
  const [leadProvider, ...supportingProviders] = hospitals;
  return <>
    <section className="home-answer container" aria-labelledby="example-title"><div className="home-answer__statement"><span className="section-note"><T>{'From a question to published options'}</T></span><h2 id="example-title"><T>{'One question.'}</T><br/><em><T>{'More clarity.'}</T></em></h2><p><T>{'Explore a real published option, then ask MedBridge AI to check the details that matter to you.'}</T></p><Link className="text-link" href={`/assistant?${new URLSearchParams({q:exampleQuestion,start:'1'})}`}><T>{'Try this question'}</T><ArrowUpRight size={18} aria-hidden="true"/></Link></div><div className="home-answer__result"><div className="home-answer__question"><span aria-hidden="true">↗</span><p><T>{'“Show me health check packages in Pune.”'}</T></p></div><div className="home-answer__published"><span className="section-note"><BookOpenCheck size={15} aria-hidden="true"/><T>{'Published option preview'}</T></span>{example?<article><p>{example.hospitalName} · {example.city}</p><h3><Link href={`/packages/${example.slug}`}>{example.name}</Link></h3><PackagePrice item={example} compact/><details><summary><T>{'What is included?'}</T></summary><ul>{example.inclusions.slice(0,4).map(item=><li key={item}>{item}</li>)}</ul><Link href={`/packages/${example.slug}`}><T>{'View all inclusions and evidence'}</T> →</Link></details><small><T>{'Current availability and final price need provider confirmation.'}</T></small></article>:<p><T>{'No published package matches this example yet. Ask MedBridge AI to explore available options.'}</T></p>}</div></div></section>
    <section className="home-network container" aria-labelledby="providers-title"><header><h2 id="providers-title"><T>{'Meet the options'}</T> <em><T>{'behind the answer.'}</T></em></h2><Link className="text-link" href="/hospitals"><T>{'Explore all hospitals'}</T><ArrowUpRight size={18} aria-hidden="true"/></Link></header>{leadProvider?<div className="home-network__composition"><article className="home-network__lead"><IdentityArt name={leadProvider.name}/><div><span className="section-note">{leadProvider.city}, {leadProvider.country}</span><h3><Link href={`/hospitals/${leadProvider.slug}`}>{leadProvider.name}</Link></h3><p>{leadProvider.specialties.slice(0,3).join(' · ')}</p><small><T>{leadProvider.provenance?.origin==='admin_reference'?'MedBridge reference information':'Published provider · inspect field evidence'}</T></small><Link className="text-link" href={`/hospitals/${leadProvider.slug}`}><T>{'View hospital'}</T><ArrowUpRight size={18} aria-hidden="true"/></Link></div></article><div className="home-network__support">{supportingProviders.map(item=><article key={item.slug}><p>{item.city}, {item.country}</p><h3><Link href={`/hospitals/${item.slug}`}>{item.name}</Link></h3><span>{item.specialties.slice(0,3).join(' · ')}</span><Link className="text-link" href={`/hospitals/${item.slug}`}><T>{'View hospital'}</T><ArrowUpRight size={16} aria-hidden="true"/></Link></article>)}<p className="home-network__context"><T>{'A selection from the published directory, not a recommendation.'}</T></p></div></div>:<p className="catalog-empty"><T>{'No published hospitals are available yet. Reviewed provider listings will appear here when published.'}</T></p>}<div className="home-network__clinicians"><h3><T>{'People behind the care.'}</T></h3><div>{doctors.slice(0,3).map(item=><Link key={item.slug} href={`/doctors/${item.slug}`}><span className="clinician-initial" aria-hidden="true">{item.name.replace(/^Dr\.?\s*/, '').split(' ').slice(0,2).map(part=>part[0]).join('')}</span><span><strong>{item.name}</strong><small>{item.specialty} · {item.city}</small></span><ArrowUpRight size={18} aria-hidden="true"/></Link>)}</div><Link className="text-link" href="/doctors"><T>{'Explore all doctors'}</T><ArrowRight size={17} aria-hidden="true"/></Link></div></section>
    <section className="home-topics container" aria-labelledby="topics-title"><header><span className="section-note"><T>{'Begin with a topic.'}</T></span><h2 id="topics-title"><T>{'What would you like'}</T> <em><T>{'to understand?'}</T></em></h2></header><TreatmentExplorer topics={treatments.map(({slug,name,specialty,description})=>({slug,name,specialty,description}))}/></section>
    <section className="home-pricing" aria-labelledby="pricing-title"><div className="container"><header><div><span className="section-note"><T>{'Price and details, together.'}</T></span><h2 id="pricing-title"><T>{'The price is a starting point.'}</T><br/><em><T>{'The details matter.'}</T></em></h2></div><Link className="text-link" href="/packages"><T>{'Explore packages'}</T><ArrowUpRight size={18} aria-hidden="true"/></Link></header><div className="home-pricing__collection">{packages.map(item=><article key={item.recordId}><p>{item.hospitalName}</p><h3><Link href={`/packages/${item.slug}`}>{item.name}</Link></h3><PackagePrice compact item={item}/><details><summary><T>{'Details to confirm'}</T></summary><p>{item.inclusions.length?item.inclusions.slice(0,3).join(' · '):<T>{'Not provided in published package information.'}</T>}</p><p><T>{item.priceType==='published_price'?'Conditional published tariff; provider confirmation required.':'Current price and availability need confirmation.'}</T></p></details><Link className="text-link" href={`/packages/${item.slug}`}><T>{'View package'}</T><ArrowUpRight size={18} aria-hidden="true"/></Link></article>)}</div></div></section>
  </>;
}
