import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import { ArrowUpRight } from 'lucide-react';

/** Prefills the private workspace; the user reviews and submits the request. */
export function SearchPrompt({ id, label = 'What are you looking for?', compact = false }: { id: string; label?: string; compact?: boolean }) {
  return <form className={`request-prompt${compact ? ' request-prompt--compact' : ''}`} action="/assistant" method="get">
    <label htmlFor={id}><T>{label}</T></label>
    <Localized as="textarea" id={id} name="q" rows={2} maxLength={2000} required placeholder="I’m looking for knee replacement in Mumbai under $6,000…" />
    <div className="request-prompt__foot"><span><T>{"Start with a question. Keep the next steps together."}</T></span><button className="button button--primary" type="submit"><T>{"Ask MedBridge AI"}</T><ArrowUpRight size={18} aria-hidden="true" /></button></div>
  </form>;
}
