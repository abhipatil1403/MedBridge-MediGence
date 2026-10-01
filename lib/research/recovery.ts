import type { RuntimeContext } from '@/lib/agents/runtime';
import type { CatalogSnapshot } from '@/types/catalog';
import { prepareResearchExecution } from './agent';
import { selectSources } from './sources';

/** Append recovery to the existing workflow/loop, preserving its plan, outputs and partial results. */
export function withResearchRecovery(execution: NonNullable<RuntimeContext['execution']>, content: string, snapshot: CatalogSnapshot) {
  const research = prepareResearchExecution(content, snapshot);
  const nextSteps = execution.nextSteps, finalize = execution.finalize;
  execution.nextSteps = async (results, tasks) => {
    const required = await nextSteps?.(results, tasks) ?? [];
    if (required.length) return required;
    const internal = results.filter(r => ['search_hospitals', 'search_packages'].includes(r.tool));
    // Empty, successfully read catalog data can justify research; failure or partially met constraints cannot.
    if (!internal.some(r => r.tool === 'search_hospitals') || internal.some(r => r.result.findings.length) || results.some(r => r.tool === 'research_healthcare_information')
      || tasks.some(t => ['search_hospitals', 'search_packages'].includes(t.tool) && t.status !== 'completed')) return [];
    const steps = await research.nextSteps?.(results, tasks) ?? [];
    if (!research.researchAuthorization || !selectSources(research.researchAuthorization.input).length) return [];
    execution.researchAuthorization = research.researchAuthorization;
    return steps;
  };
  execution.finalize = async (response, results) => {
    const preserved = await finalize?.(response, results) ?? response;
    const result = results.find(r => r.result.research)?.result.research;
    return result ? { ...preserved, research: result,
      summary: `${preserved.summary} External research: ${result.findings.length} attributed evidence items. These are separate from catalog matches.`.slice(0, 1600) } : preserved;
  };
  return execution;
}
