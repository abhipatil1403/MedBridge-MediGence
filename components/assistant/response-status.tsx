import { T } from '@/components/experience/translation';
import type { CompoundRequest } from '@/lib/orchestration/CompoundRequest';
import { StatusMark } from './response-presentation';

export function visibleText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && !/^(?:null|undefined|\[object Object\])$/i.test(text) ? text : undefined;
}

export function ClarificationQuestion({ question }: { question: unknown }) {
  const text = visibleText(question);
  return text ? <div className="assistant-response__question"><small><T>{"WHAT I NEED FROM YOU"}</T></small><p>{text}</p></div> : null;
}

const labels: Record<string, string> = { discover_hospitals: 'Hospital search', discover_doctors: 'Doctor search',
  discover_packages: 'Package search', discover_services: 'General services · hospital availability unconfirmed',
  evaluate_requirements: 'Requirement check', compare_results: 'Comparison' };

export function RequestProgress({ request }: { request?: CompoundRequest }) {
  const entries = request?.operations.flatMap(op => {
    const label = labels[op.type], status = visibleText(op.status);
    return label && status ? [{ id: op.id, label, status: status.replaceAll('_', ' '), note: visibleText(op.note) }] : [];
  }) ?? [];
  if (!entries.length) return null;
  return <details className="assistant-progress"><summary><T>{"Request progress"}</T></summary><ol className="assistant-request-progress">{entries.map(entry =>
    <li key={entry.id}><StatusMark status={entry.status} /><div><strong><T>{entry.label}</T></strong><span><T>{entry.status}</T></span>{entry.note && <p>{entry.note}</p>}</div></li>)}</ol></details>;
}
