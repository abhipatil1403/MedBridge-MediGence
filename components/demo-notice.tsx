export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? "demo-notice demo-notice--compact" : "demo-notice"} role="note">
    <strong>Demonstration data</strong>
    <span>Providers, clinicians, credentials, prices, stays and packages shown here are synthetic examples. Nothing is verified, bookable, or a medical recommendation.</span>
  </div>;
}
