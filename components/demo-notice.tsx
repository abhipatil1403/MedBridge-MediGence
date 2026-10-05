import { T } from '@/components/experience/translation';
export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return <details className={compact ? 'demo-notice demo-notice--compact' : 'demo-notice'}>
    <summary><T>{"Demo data"}</T><span><T>{"Synthetic examples"}</T></span></summary>
    <p><T>{"Synthetic providers and sample prices. Not live, verified or bookable care."}</T></p>
  </details>;
}
