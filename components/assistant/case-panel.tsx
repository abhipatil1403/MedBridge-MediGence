import { T } from '@/components/experience/translation';
import { Localized } from '@/components/experience/localized';
import type { PatientCase, CaseSummary } from '@/lib/case/CaseTypes';
import { summarizeCase } from '@/lib/case/CaseSummary';

export function CaseSummaryContent({ summary }: { summary: CaseSummary }) {
  return <div className="case-summary">{(summary.focus === 'missing_information' ? [] : summary.sections).map((section) => <div key={section.label}><strong>{section.label}</strong>
    <ul>{section.statements.map((statement) => <li key={statement.itemId}>{statement.text}</li>)}</ul></div>)}
    {!summary.sections.some((s) => s.label === 'Reported diagnosis') && <p><strong><T>{"Diagnosis"}</T></strong> <T>{"· Not provided"}</T></p>}
    <details open={summary.focus === 'missing_information'}><summary><T>{"Information that may help"}</T></summary><ul>{summary.missingInformation.map((item) => <li key={item.key}>
      {item.label} · {item.category.replaceAll('_', ' ')}</li>)}</ul></details>
    <p className="case-source-label"><T>{"User supplied · Not clinically verified"}</T></p></div>;
}
export function CasePanel({ draft, busy, onAction }: { draft: PatientCase; busy: boolean; onAction: (text: string) => void }) {
  return <Localized as="section" className="assistant-context__panel" aria-label="Your case"><p className="eyebrow"><T>{"YOUR CASE"}</T></p>
    <h2><T>{"Reported case draft"}</T></h2><CaseSummaryContent summary={summarizeCase(draft)} />
    {draft.documents.length > 0 && <div><strong><T>{"Document references"}</T></strong><ul>{draft.documents.map((document) =>
      <li key={document.documentId}>{document.title ?? document.documentType ?? 'Uploaded document'} <T>{"· Uploaded, not processed"}</T></li>)}</ul></div>}
    <p><T>{"Review and correct anything inaccurate before using this draft for coordination. Confirming it records your agreement; a clinician has not verified it."}</T></p>
    <div className="case-review-actions">{[['Confirm', 'Confirm my case'], ['Edit', 'Edit my case'], ['Add information', 'Add case information'], ['Continue', 'Continue with this case']].map(([label, text]) =>
      <button key={label} type="button" disabled={busy} onClick={() => onAction(text)}>{label}</button>)}</div>
    {draft.confirmedRevision === draft.revision && <small><T>{"You confirmed this version."}</T></small>}
  </Localized>;
}
