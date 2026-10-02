import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DemoNotice } from "@/components/demo-notice";
import { getServiceBySlug } from "@/lib/catalog/repository";
import { PageHeader } from './page-header';

export async function ServiceLanding({ slug, title, intro, nextHref, nextLabel, children }: {
  slug: string; title: string; intro: string; nextHref: string; nextLabel: string; children?: React.ReactNode;
}) {
  const service = await getServiceBySlug(slug);
  if (!service) return <main id="main-content" tabIndex={-1} className="container service-page"><PageHeader eyebrow="CARE SERVICE" title={title} description={intro} /><section className="result-state" role="status"><h2>This pathway is temporarily unavailable</h2><p>Explore care options while we restore the service information.</p><Link className="button button--primary button--default" href="/discover">Explore care options</Link></section></main>;
  return <main id="main-content" tabIndex={-1} className="container service-page">
    <Breadcrumbs currentPath={service.href} items={[{ label: "Home", href: "/" }, { label: title }]} />
    <PageHeader eyebrow="CARE SERVICE" title={title} description={intro} />
    <DemoNotice compact />
    {children}
    <section className="service-steps" aria-labelledby="service-steps-title"><div><p className="eyebrow">HOW THIS PATHWAY WORKS</p><h2 id="service-steps-title">A clear path from question to next step.</h2></div><ol>{service.steps.map((step, index) => <li key={step}><span>0{index + 1}</span><p>{step}</p></li>)}</ol></section>
    <div className="service-page__next"><div><h2>Continue exploring</h2><p>This preview helps you discover options. Requests, payments, appointments and clinical review are not yet active.</p></div><Link className="button button--primary button--default" href={nextHref}>{nextLabel}</Link></div>
  </main>;
}
