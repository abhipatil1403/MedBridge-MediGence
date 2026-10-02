export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "demo-notice demo-notice--compact" : "demo-notice"} role="note">
    <strong>Demo data</strong>
    <span>Synthetic providers and sample prices. Not live, verified or bookable care.</span>
  </div>;
}
