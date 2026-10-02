"use client";
import { ArrowUpRight, ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActiveNavigation, navigationGroups } from '@/lib/navigation';
import { useEffect, useRef, useState } from 'react';

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const groupButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    function close(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (group) groupButtons.current[group]?.focus();
        else if (open) toggle.current?.focus();
        setOpen(false); setGroup(null);
      }
    }
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setGroup(null); }
    }
    document.addEventListener('keydown',close);
    document.addEventListener('pointerdown',outside);
    return () => { document.removeEventListener('keydown',close); document.removeEventListener('pointerdown',outside); };
  }, [open,group]);
  const close = () => { setOpen(false); setGroup(null); };
  return <header className="site-header" ref={root} onBlur={event=>{if (!event.currentTarget.contains(event.relatedTarget)) setGroup(null);}}>
    <div className="site-header__inner container">
      <Link className="brand" href="/" aria-label="MedBridge home" onClick={close}><span className="brand__mark" aria-hidden="true"><span /><span /><span /></span><span>MEDBRIDGE</span></Link>
      <nav className="desktop-nav" aria-label="Primary navigation">
        <Link href="/discover" aria-current={isActiveNavigation(pathname,'/discover')?'page':undefined} onClick={close}>Discover</Link>
        {navigationGroups.map(section=><div className="navigation-group" key={section.label}>
          <button ref={element=>{groupButtons.current[section.label]=element;}} type="button" aria-expanded={group===section.label} aria-controls={`nav-${section.label}`} className={section.items.some(item=>isActiveNavigation(pathname,item.href))?'is-active':undefined} onClick={()=>setGroup(group===section.label?null:section.label)}>{section.label}<ChevronDown size={14} aria-hidden="true" /></button>
          {group===section.label && <div className="navigation-popover" id={`nav-${section.label}`}>{section.items.map(item=><Link key={item.href} href={item.href} aria-current={isActiveNavigation(pathname,item.href)?'page':undefined} onClick={close}>{item.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}</div>}
        </div>)}
        <Link href="/compare" aria-current={isActiveNavigation(pathname,'/compare')?'page':undefined} onClick={close}>Compare</Link>
      </nav>
      <Link className="header-workspace button button--primary" href="/assistant" onClick={close}>Care Workspace <ArrowUpRight size={16} aria-hidden="true" /></Link>
      <button ref={toggle} className="menu-toggle" type="button" aria-controls="mobile-navigation" aria-expanded={open} aria-label={open?'Close navigation':'Open navigation'} onClick={()=>setOpen(!open)}>{open?<X size={22} aria-hidden="true" />:<Menu size={22} aria-hidden="true" />}</button>
    </div>
    {open && <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation"><div className="container mobile-nav__inner"><Link className="mobile-nav__primary" href="/assistant" onClick={close}>Care Workspace <ArrowUpRight size={20} aria-hidden="true" /></Link><div className="mobile-nav__groups">{navigationGroups.map(section=><section key={section.label}><p className="eyebrow">{section.label}</p>{section.items.map(item=><Link href={item.href} key={item.href} aria-current={isActiveNavigation(pathname,item.href)?'page':undefined} onClick={close}>{item.label}</Link>)}</section>)}</div></div></nav>}
  </header>;
}
