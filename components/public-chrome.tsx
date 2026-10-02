'use client';
import { usePathname } from 'next/navigation';
import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';
export function PublicChrome({position}:{position:'header'|'footer'}) {
  const pathname=usePathname();
  if(/^\/(provider|support|admin)(\/|$)/.test(pathname)) return null;
  return position==='header'?<SiteHeader/>:<SiteFooter/>;
}
