import Link from "next/link";
import { Localized } from '@/components/experience/localized';

export interface Crumb { label: string; href?: string }

export function Breadcrumbs({ items, currentPath }: { items: readonly Crumb[]; currentPath: string }) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const structured = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem", position: index + 1, name: item.label,
      item: new URL(item.href ?? currentPath, base).toString(),
    })),
  };
  return <>
    <Localized as="nav" className="breadcrumbs" aria-label="Breadcrumb">
      <ol>{items.map((item, index) => <li key={`${item.label}-${index}`}>
        {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
      </li>)}</ol>
    </Localized>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, "\\u003c") }} />
  </>;
}
