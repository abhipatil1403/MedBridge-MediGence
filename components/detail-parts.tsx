import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import Link from '@/components/catalog-link';
import type { Faq } from "@/types/catalog";
import { PageHeader } from './page-header';

export function DetailSection({ id, title, children,disclosure=false }: { id?: string; title: string; children: React.ReactNode;disclosure?:boolean }) {
  const anchor=id??title.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  if(disclosure)return <details className="detail-section detail-section--disclosure" id={anchor}><summary><T>{title}</T><span className="detail-confirmation-label"><T>{'Confirmation required'}</T></span></summary>{children}</details>;
  return <section className="detail-section" id={anchor}><h2><T>{title}</T></h2>{children}</section>;
}

export function DetailNavigation({ items }: { items: readonly { label: string; href: string }[] }) {
  return <Localized as="nav" className="detail-navigation" aria-label="On this page">{items.map(item=><Link key={item.href} href={item.href}><T>{item.label}</T></Link>)}</Localized>;
}

export function FaqList({ items }: { items: readonly Faq[] }) {
  return <div className="faq-list">{items.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>;
}

export function DetailLinks({ items }: { items: readonly { label: string; href: string; meta?: React.ReactNode }[] }) {
  return <ul className="detail-links">{items.map((item) => <li key={item.href}><Link href={item.href}><span>{item.label}</span></Link>{item.meta && <small>{item.meta}</small>}</li>)}</ul>;
}

export function DetailHero({ type, title, intro, facts, actions, summary }: {
  type: string; title: string; intro: string; facts: readonly string[];
  summary?: React.ReactNode;
  actions: readonly { label: string; href: string; primary?: boolean }[];
}) {
  return <div className="detail-hero"><PageHeader canonical eyebrow={type} title={title} description={intro}><ul className="detail-hero__facts">{facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></PageHeader><div className="detail-hero__decision">{summary}<div className="detail-hero__actions">{actions.map((action) => <Link key={action.href} className={action.primary ? "button button--primary button--default" : "text-link"} href={action.href}><T>{action.label}</T></Link>)}</div></div></div>;
}
