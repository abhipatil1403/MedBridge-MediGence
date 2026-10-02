import Link from "next/link";
import type { Faq } from "@/types/catalog";
import { PageHeader } from './page-header';

export function DetailSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return <section className="detail-section" id={id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}><h2>{title}</h2>{children}</section>;
}

export function DetailNavigation({ items }: { items: readonly { label: string; href: string }[] }) {
  return <nav className="detail-navigation" aria-label="On this page">{items.map(item=><Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>;
}

export function FaqList({ items }: { items: readonly Faq[] }) {
  return <div className="faq-list">{items.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>;
}

export function DetailLinks({ items }: { items: readonly { label: string; href: string; meta?: string }[] }) {
  return <ul className="detail-links">{items.map((item) => <li key={item.href}><Link href={item.href}><span>{item.label}</span>{item.meta && <small>{item.meta}</small>}</Link></li>)}</ul>;
}

export function DetailHero({ type, title, intro, facts, actions }: {
  type: string; title: string; intro: string; facts: readonly string[];
  actions: readonly { label: string; href: string; primary?: boolean }[];
}) {
  return <div className="detail-hero"><PageHeader eyebrow={type} title={title} description={intro}><div className="detail-hero__facts">{facts.map((fact) => <span key={fact}>{fact}</span>)}</div></PageHeader><div className="detail-hero__actions">{actions.map((action) => <Link key={action.href} className={action.primary ? "button button--primary button--default" : "button button--outline button--default"} href={action.href}>{action.label}</Link>)}</div></div>;
}
