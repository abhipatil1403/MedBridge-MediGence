import { T } from '@/components/experience/translation';
import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import { getServiceBySlug } from "@/lib/catalog/repository";
import { PageHeader } from './page-header';

export async function ServiceLanding({ slug, title, intro, nextHref, nextLabel, children }: {
  slug: string; title: string; intro: string; nextHref: string; nextLabel: string; children?: React.ReactNode;
}) {
  const service = await getServiceBySlug(slug);
  const contexts: Record<string, { title: string; items: string[] }> = {
    'second-opinion': { title: 'What you’ll need', items: ['The question you want reviewed', 'Relevant records and investigations', 'Consent for professional review'] },
    'medical-travel': { title: 'Keep the practical details together', items: ['Destination and care dates', 'Official visa requirements', 'Accommodation and transfers', 'Interpreter and companion needs'] },
    recovery: { title: 'Continuity after care', items: ['Clinician-approved follow-up', 'Rehabilitation arrangements', 'Support at home', 'Local care handover'] },
    consultation: { title: 'Before a professional consultation', items: ['Your question and relevant records', 'A qualified professional', 'Confirmed appointment arrangements'] },
  };
  const context = contexts[slug];
  if (!service) return <main id="main-content" tabIndex={-1} className="container service-page"><PageHeader eyebrow="CARE SERVICE" title={title} description={intro} /><section className="result-state" role="status"><h2><T>{"This pathway is temporarily unavailable"}</T></h2><p><T>{"Explore care options while we restore the service information."}</T></p><Link className="button button--primary button--default" href="/discover"><T>{"Explore care options"}</T></Link></section></main>;
  return <main id="main-content" tabIndex={-1} className={`container service-page service-page--${slug}`}>
    <Breadcrumbs currentPath={service.href} items={[{ label: "Home", href: "/" }, { label: service.name }]} />
    <div className="service-opening"><PageHeader eyebrow={`PLAN · ${service.name}`} title={title} description={intro} />{context && <aside className="service-opening__context"><h2>{context.title}</h2><ul>{context.items.map(item=><li key={item}>{item}</li>)}</ul></aside>}</div>
    <DemoNotice compact />
    {children}
    <section className="service-steps" aria-labelledby="service-steps-title"><div><p className="eyebrow"><T>{"THE PATH AHEAD"}</T></p><h2 id="service-steps-title"><T>{slug === 'recovery' ? 'Keep the handover clear.' : slug === 'medical-travel' ? 'Care first. Logistics follow.' : 'Prepare for a useful conversation.'}</T></h2><p className="editorial-note"><T>{"An outline for preparation. Professional review and arrangements must be confirmed outside MedBridge."}</T></p></div><ol>{service.steps.map((step, index) => <li key={step}><span>0{index + 1}</span><p>{step}</p></li>)}</ol></section>
    <div className="service-page__next"><div><h2><T>{slug === 'recovery' ? 'Explore the support you may need.' : 'Take your next step.'}</T></h2><p><T>{"Requests, payments, appointments and clinical review are not active. The workspace can help organize your questions."}</T></p></div><Link className="button button--primary button--default" href={nextHref}>{nextLabel}</Link></div>
  </main>;
}
