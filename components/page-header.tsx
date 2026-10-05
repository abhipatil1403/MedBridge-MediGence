import { MedBridgeLogo } from './medbridge-logo';
import type { ReactNode } from 'react';
import { T } from '@/components/experience/translation';

/** Shared title, lead and content rhythm for public pages and the workspace. */
export function PageHeader({ eyebrow, title, description, children, compact = false, canonical = false }: {
  eyebrow: string; title: string; description?: string; children?: ReactNode; compact?: boolean;canonical?:boolean;
}) {
  return <header className={`page-header${compact ? ' page-header--compact' : ''}`}>
    <p className="eyebrow">{eyebrow.startsWith('MEDBRIDGE')&&<MedBridgeLogo compact/>}{eyebrow.split(' · ').map((part,index)=><span key={`${part}:${index}`}>{index>0?' · ':''}<T>{part}</T></span>)}</p><h1>{canonical?title:<T>{title}</T>}</h1>
    {description && <p className="page-header__lead">{canonical?description:<T>{description}</T>}</p>}
    {children && <div className="page-header__support">{children}</div>}
  </header>;
}
