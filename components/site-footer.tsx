import Link from "next/link";
import { navigation } from "@/lib/navigation";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Link className="brand brand--light" href="/" aria-label="MedBridge home">
            <span className="brand__mark" aria-hidden="true"><span /><span /><span /></span>
            <span>MEDBRIDGE</span>
          </Link>
          <p>Built around clearer choices and continuous care.</p>
        </div>
        <nav aria-label="Footer navigation">
          <span className="footer-label">Explore</span>
          {[...navigation.slice(1), {label:"Packages",href:"/packages"}, {label:"Medical travel",href:"/medical-travel"}, {label:"Recovery",href:"/recovery"}].map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <div className="footer-note">
          <span className="footer-label">Platform status</span>
          <p>Discovery uses synthetic sample records. Bookings, payments and clinical review are not active.</p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} MedBridge</span>
        <span>Information here is not medical advice.</span>
      </div>
    </footer>
  );
}
