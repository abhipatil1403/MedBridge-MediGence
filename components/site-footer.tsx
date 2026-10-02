import Link from 'next/link';
import { navigationGroups } from '@/lib/navigation';
export function SiteFooter() {
  return <footer className="site-footer"><div className="container footer-grid"><div><Link className="brand brand--light" href="/" aria-label="MedBridge home"><span className="brand__mark" aria-hidden="true"><span /><span /><span /></span><span>MEDBRIDGE</span></Link><p>A clearer way through your healthcare questions.</p><p className="footer-limit">Discovery uses synthetic examples. Bookings, payments and clinical review are not active.</p></div>{navigationGroups.map(group=><nav key={group.label} aria-label={`Footer ${group.label}`}><span className="footer-label">{group.label}</span>{group.items.slice(0,5).map(item=><Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>)}</div><div className="container footer-bottom"><span>© {new Date().getFullYear()} MedBridge</span><span>Information here is not medical advice.</span></div></footer>;
}
