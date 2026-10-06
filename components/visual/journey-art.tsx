import Link from '@/components/catalog-link';
import { T } from '@/components/experience/translation';
import { ArrowUpRight } from 'lucide-react';

/** A navigation diagram, not a clinical progress indicator or geographic map. */
export function JourneyArt({ compact = false }: { compact?: boolean }) {
  return <div className={`journey-art${compact ? ' journey-art--compact' : ''}`}>
    <svg className="journey-art__path" viewBox="0 0 480 540" fill="none" aria-hidden="true">
      <path className="journey-art__contour" d="M480 4H244C148 4 76 78 76 174v366M480 44H260c-78 0-144 64-144 144v352M480 84H274c-62 0-118 54-118 116v340" />
      <path className="journey-art__route" d="M120 120h142c80 0 80 142 0 142h-42c-80 0-80 144 0 144h142" />
      <circle cx="120" cy="120" r="9" /><circle cx="272" cy="262" r="9" /><circle cx="362" cy="406" r="9" />
    </svg>
    <p className="journey-art__caption"><T>{'A path you can make your own.'}</T></p>
    <Link href="/discover" className="journey-art__stage journey-art__stage--plan"><span>01</span><div><strong><T>{'Plan'}</T></strong><small><T>{'Explore & compare'}</T></small></div><ArrowUpRight size={18} aria-hidden="true"/></Link>
    <Link href="/packages" className="journey-art__stage journey-art__stage--treat"><span>02</span><div><strong><T>{'Treat'}</T></strong><small><T>{'Prepare the next step'}</T></small></div><ArrowUpRight size={18} aria-hidden="true"/></Link>
    <Link href="/recover" className="journey-art__stage journey-art__stage--recover"><span>03</span><div><strong><T>{'Recover'}</T></strong><small><T>{'Keep your journey together'}</T></small></div><ArrowUpRight size={18} aria-hidden="true"/></Link>
    <p className="journey-art__note"><T>{'Your clinician guides medical care.'}</T></p>
  </div>;
}

export function BridgeGlyph() {
  return <svg className="bridge-glyph" viewBox="0 0 120 80" fill="none" aria-hidden="true"><path d="M12 64V40a22 22 0 0 1 44 0v24M64 64V40a22 22 0 0 1 44 0v24M22 64V41a12 12 0 0 1 24 0v23M74 64V41a12 12 0 0 1 24 0v23"/><path d="M4 64h112"/><circle cx="60" cy="64" r="4"/></svg>;
}
