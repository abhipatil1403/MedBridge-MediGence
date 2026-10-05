import { MedBridgeLogo } from './medbridge-logo';
import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import Link from '@/components/catalog-link';
import { navigationGroups } from '@/lib/navigation';
export function SiteFooter() {
  return <footer className="site-footer"><div className="container footer-grid"><div><Link className="brand brand--light" href="/" aria-label="MedBridge home"><MedBridgeLogo onDark/></Link><p><T>{"A clearer way through your healthcare questions."}</T></p><p className="footer-limit"><T>{"Catalog listings require review and publication. Confirm current details with the provider. Bookings, payments and clinical review are not active."}</T></p></div>{navigationGroups.map(group=><nav key={group.label} aria-label={`Footer ${group.label}`}><span className="footer-label"><T>{group.label}</T></span>{group.items.slice(0,5).map(item=><Link key={item.href} href={item.href}><T>{item.label}</T></Link>)}</nav>)}<Localized as="nav" aria-label="Platform portals"><span className="footer-label"><T>{"Platform"}</T></span><Link href="/help"><T>{"Get support"}</T></Link><Link href="/provider"><T>{"Provider portal"}</T></Link><Link href="/support"><T>{"Support portal"}</T></Link><Link href="/admin"><T>{"Admin portal"}</T></Link></Localized></div><div className="container footer-bottom"><span>© {new Date().getFullYear()} MedBridge</span><span><T>{"Information here is not medical advice."}</T></span></div></footer>;
}
