'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { T, useTranslation } from '@/components/experience/translation';

type Topic = { slug: string; name: string; specialty: string; description: string };
export function TreatmentExplorer({ topics }: { topics: readonly Topic[] }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(topics[0]?.slug);
  const topic = topics.find(item => item.slug === selected) ?? topics[0];
  if (!topic) return <p><T>{'Published treatment information is being prepared.'}</T></p>;
  return <div className="treatment-explorer"><div className="treatment-explorer__choices" role="group" aria-label={t('Treatment areas')}>{topics.map((item, index) => <button key={item.slug} type="button" aria-pressed={topic.slug === item.slug} aria-controls="home-treatment-preview" onClick={() => setSelected(item.slug)}><span>{String(index + 1).padStart(2, '0')}</span>{item.name}<ArrowUpRight size={18} aria-hidden="true"/></button>)}</div><div id="home-treatment-preview" className="treatment-explorer__preview" aria-live="polite"><span>{topic.specialty}</span><h3>{topic.name}</h3><p>{topic.description}</p><Link className="text-link" href={`/treatments/${topic.slug}`}><T>{'Explore treatment'}</T><ArrowUpRight size={18} aria-hidden="true"/></Link><small><T>{'Treatment content is for exploration and has not been clinically reviewed.'}</T></small></div></div>;
}
