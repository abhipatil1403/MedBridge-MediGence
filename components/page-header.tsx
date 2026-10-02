import type { ReactNode } from 'react';

/** Shared title, lead and content rhythm for public pages and the workspace. */
export function PageHeader({ eyebrow, title, description, children, compact = false }: {
  eyebrow: string; title: string; description?: string; children?: ReactNode; compact?: boolean;
}) {
  return <header className={`page-header${compact ? ' page-header--compact' : ''}`}>
    <p className="eyebrow">{eyebrow}</p><h1>{title}</h1>
    {description && <p className="page-header__lead">{description}</p>}
    {children && <div className="page-header__support">{children}</div>}
  </header>;
}
