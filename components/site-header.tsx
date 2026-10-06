'use client';
import { trapDialogFocus } from "@/components/dialog-focus";
import { ArrowUpRight, ChevronDown, Menu, X, UserRound } from 'lucide-react';
import Link from '@/components/catalog-link';
import { usePathname } from 'next/navigation';
import { isActiveNavigation, navigationGroups } from '@/lib/navigation';
import { useEffect, useRef, useState } from 'react';
import { MedBridgeLogo } from './medbridge-logo';
import { PreferenceSelectors } from './experience/selectors';
import { useTranslation } from './experience/translation';

const drawerGroups=[...navigationGroups,{label:'Travel',items:[{label:'Medical travel',href:'/medical-travel'}]},
  {label:'Account',items:[{label:'Profile',href:'/account'},{label:'Saved',href:'/account?section=saved'},{label:'My plans',href:'/account?section=plans'},{label:'Recovery journey',href:'/recover'},{label:'Help / Support',href:'/help'}]}];
export function SiteHeader() {
  const pathname=usePathname(),{t}=useTranslation();
  const [group,setGroup]=useState<string|null>(null);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const root=useRef<HTMLElement>(null),dialog=useRef<HTMLDialogElement>(null),toggle=useRef<HTMLButtonElement>(null);
  const buttons=useRef<Record<string,HTMLButtonElement|null>>({});
  const close=()=>{dialog.current?.close();setGroup(null);};
  useEffect(()=>{
    const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setGroup(null);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&group){buttons.current[group]?.focus();setGroup(null);}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[group]);
  return <header className="site-header" ref={root}>
    <div className="site-header__inner container">
      <Link className="brand" href="/" aria-label={t('MedBridge home')} onClick={close}><MedBridgeLogo priority/><span className="brand__name">MEDBRIDGE</span></Link>
      <nav className="desktop-nav" aria-label={t('Primary navigation')}>
        {navigationGroups.filter(section=>section.label==='Explore').map(section=><div className="navigation-group" key={section.label} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setGroup(null);}}>
          <button ref={el=>{buttons.current[section.label]=el;}} type="button" aria-current={section.items.some(item=>isActiveNavigation(pathname,item.href))?'true':undefined} aria-expanded={group===section.label} aria-controls={`nav-${section.label}`} onClick={()=>setGroup(group===section.label?null:section.label)}>{t(section.label)}<ChevronDown size={14} aria-hidden="true"/></button>
          {group===section.label&&<div className="navigation-popover" id={`nav-${section.label}`}>{section.items.filter(item=>item.href!=='/compare').map(item=><Link key={item.href} href={item.href} onClick={close}>{t(item.label)}<ArrowUpRight size={14} aria-hidden="true"/></Link>)}</div>}
        </div>)}
        <Link href="/packages" aria-current={isActiveNavigation(pathname,'/packages')?'page':undefined} onClick={close}>{t('Packages')}</Link>
        <Link href="/compare" aria-current={isActiveNavigation(pathname,'/compare')?'page':undefined} onClick={close}>{t('Compare')}</Link>
        <Link href="/recover" aria-current={isActiveNavigation(pathname,'/recover')?'page':undefined} onClick={close}>{t('Recover')}</Link>
      </nav>
      <div className="header-preferences"><PreferenceSelectors/></div>
      <Link className="header-account" href="/account" aria-label={t('Account')} onClick={close}><UserRound size={19} aria-hidden="true"/></Link>
      <Link className="header-workspace button button--primary" href="/assistant" aria-label={t('Ask MedBridge AI')} onClick={close}><span className="header-workspace__label">{t('Ask MedBridge AI')}</span><span className="header-workspace__compact" aria-hidden="true">{t('Ask AI')}</span><ArrowUpRight size={16} aria-hidden="true"/></Link>
      <button ref={toggle} className="menu-toggle" type="button" aria-expanded={drawerOpen} aria-controls="mobile-navigation" aria-label={t('Open navigation')} onClick={()=>{dialog.current?.showModal();setDrawerOpen(true);document.body.style.overflow='hidden';}}><Menu size={22} aria-hidden="true"/></button>
    </div>
    <dialog onKeyDown={trapDialogFocus} id="mobile-navigation" className="navigation-drawer" ref={dialog} aria-label={t('Mobile navigation')} onClose={()=>{setDrawerOpen(false);document.body.style.overflow='';toggle.current?.focus();}} onClick={e=>{if(e.target===e.currentTarget)close();}}>
      <div className="drawer-surface"><div className="drawer-heading"><span className="brand"><MedBridgeLogo/><span className="brand__name">MEDBRIDGE</span></span><button type="button" onClick={close} aria-label={t('Close navigation')}><X size={24} aria-hidden="true"/></button></div>
        <PreferenceSelectors/><Link className="button button--primary button--default" href="/assistant" onClick={close}>{t('MedBridge AI')}<ArrowUpRight size={18} aria-hidden="true"/></Link>
        <nav aria-label={t('Mobile navigation')}><Link href="/" onClick={close}>{t('Home')}</Link>{drawerGroups.map(section=><section key={section.label}><h2 className="eyebrow">{t(section.label)}</h2>{section.items.map(item=><Link key={item.href} href={item.href} onClick={close}>{t(item.label)}</Link>)}</section>)}</nav>
      </div>
    </dialog>
  </header>;
}
