'use client';
import Link from 'next/link';
import type { CoordinationContext } from '@/lib/experience/coordination-schema';
import { LocalDate, useTranslation } from './translation';
export function CoordinationResults({context}:{context:CoordinationContext}) {
  const {t}=useTranslation();
  return <section className="personal-panel"><h3>{t('Your coordination context')}</h3><ul className="personal-list">{context.journeys.map(j=><li key={j.id}><Link href={`/recover?journey=${j.id}`}>{j.title}</Link><span>{t(j.stage.replaceAll('_',' '))}</span></li>)}</ul><h4>{t('Tasks')}</h4><ul className="personal-list">{context.tasks.filter(task=>task.status==='open').map(task=><li key={task.id}><div>{task.title}{task.due_at&&<small><LocalDate value={task.due_at}/></small>}</div></li>)}</ul>{!context.tasks.some(task=>task.status==='open')&&<p>{t('No coordination tasks yet.')}</p>}<h4>{t('Documents')}</h4><ul>{context.documents.map(d=><li key={d.id}>{d.title}</li>)}</ul><Link href="/assistant">{t('Open in MedBridge AI')}</Link><h4>{t('Saved providers')}</h4><ul>{context.savedProviders.map((p,index)=><li key={p.hospital_id??p.doctor_id??index}>{p.href?<Link href={p.href}>{p.name}</Link>:t('Provider listing no longer available')}</li>)}</ul><Link href="/account?section=saved">{t('Saved items')}</Link><p className="personal-muted">{t('Saved providers are your selections. Confirm rehabilitation services with the provider.')}</p><Link href="/recover" className="text-link">{t('Lifetime Recover')} →</Link></section>;
}
