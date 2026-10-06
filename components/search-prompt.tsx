'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/components/experience/translation';
import { ArrowUpRight } from 'lucide-react';
import { BridgeGlyph } from '@/components/visual/journey-art';

export const starterPrompts = [
  ['Find a hospital', 'Find hospitals for knee replacement in Mumbai.'],
  ['Find a doctor', 'Find a cardiologist in Pune.'],
  ['Explore treatments', 'Show published treatments.'],
  ['Compare destinations', 'Compare knee replacement in India and Singapore.'],
  ['Find packages', 'Show health checkup packages under ₹10,000.'],
] as const;

/** An explicit submission starts one request in the existing MedBridge AI runtime. */
export function SearchPrompt({ id, label = 'What are you looking for?', compact = false, suggestions = false }: { id: string; label?: string; compact?: boolean; suggestions?: boolean }) {
  const {t}=useTranslation(),router=useRouter(),input=useRef<HTMLTextAreaElement>(null);
  const [question,setQuestion]=useState(''),[submitted,setSubmitted]=useState(false);
  function submit(event:FormEvent) {
    event.preventDefault();
    if(!question.trim()||submitted)return;
    setSubmitted(true);
    router.push(`/assistant?${new URLSearchParams({q:question.trim(),start:'1'})}`);
  }
  return <form className={`ai-entry${compact?' ai-entry--compact':''}`} onSubmit={submit}>
    <label htmlFor={id} className="ai-entry__identity"><BridgeGlyph/>{t(label)}</label>
    <textarea ref={input} id={id} name="q" rows={compact?2:3} maxLength={2000} required placeholder={t('Tell MedBridge what you need…')} value={question} onChange={event=>setQuestion(event.target.value)} />
    <div className="ai-entry__foot"><small>{t('Start in your own words. We’ll help with the next step.')}</small><button className="button button--primary" type="submit" disabled={submitted||!question.trim()}>{t(submitted?'Opening MedBridge AI…':'Ask MedBridge AI')}<ArrowUpRight size={18} aria-hidden="true"/></button></div>
    {suggestions&&<div className="ai-prompts" aria-label={t('Suggested requests')}>{starterPrompts.map(([label,prompt])=><button type="button" key={label} onClick={()=>{setQuestion(prompt);input.current?.focus();}}>{t(label)}</button>)}</div>}
  </form>;
}
