import type { PatientCase, CaseSummary } from '@/lib/case/CaseTypes';
import { summarizeCase } from '@/lib/case/CaseSummary';

export function CaseSummaryContent({ summary }: { summary: CaseSummary }) {
  return <div className="case-summary">{(summary.focus === 'missing_information' ? [] : summary.sections).map((section) => <div key={section.label}><strong>{section.label}</strong>
    <ul>{section.statements.map((statement) => <li key={statement.itemId}>{statement.text}</li>)}</ul></div>)}
    {!summary.sections.some((s) => s.label === 'Reported diagnosis') && <p><strong>Diagnosis</strong> · Not provided</p>}
    <details open={summary.focus === 'missing_information'}><summary>Information that may help</summary><ul>{summary.missingInformation.map((item) => <li key={item.key}>
      {item.label} · {item.category.replaceAll('_', ' ')}</li>)}</ul></details>
    <p className="case-source-label">User supplied · Not clinically verified</p></div>;
}
export function CasePanel({ draft, busy, onAction }: { draft: PatientCase; busy: boolean; onAction: (text: string) => void }) {
  return <section className="assistant-context__panel" aria-label="Your case"><p className="eyebrow">YOUR CASE</p>
    <h2>Reported case draft</h2><CaseSummaryContent summary={summarizeCase(draft)} />
    {draft.documents.length > 0 && <div><strong>Document references</strong><ul>{draft.documents.map((document) =>
      <li key={document.documentId}>{document.title ?? document.documentType ?? 'Uploaded document'} · Uploaded, not processed</li>)}</ul></div>}
    <p>Review and correct anything inaccurate before using this draft for coordination. Confirming it records your agreement; a clinician has not verified it.</p>
    <div className="case-review-actions">{[['Confirm', 'Confirm my case'], ['Edit', 'Edit my case'], ['Add information', 'Add case information'], ['Continue', 'Continue with this case']].map(([label, text]) =>
      <button key={label} type="button" disabled={busy} onClick={() => onAction(text)}>{label}</button>)}</div>
    {draft.confirmedRevision === draft.revision && <small>You confirmed this version.</small>}
  </section>;
}
