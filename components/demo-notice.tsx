export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return <details className={compact ? 'demo-notice demo-notice--compact' : 'demo-notice'}>
    <summary>Demo data <span>Synthetic examples</span></summary>
    <p>Synthetic providers and sample prices. Not live, verified or bookable care.</p>
  </details>;
}
