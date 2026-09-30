import type { AgentId, ToolName } from './schemas';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  purpose: string;
  allowedTools: readonly ToolName[];
  safety: string;
}

const common = ['get_case_context', 'request_user_information'] as const;
export const agents: Record<AgentId, AgentDefinition> = {
  discovery: {
    id: 'discovery', name: 'DiscoveryAgent', purpose: 'Find catalog options matching the stated criteria.',
    allowedTools: ['search_treatments', 'search_hospitals', 'search_doctors', 'search_packages', 'search_countries', 'search_services', 'get_treatment', 'get_hospital', 'get_doctor', 'get_package', 'get_country', ...common],
    safety: 'Use catalog results only. Never invent providers, clinical judgments, rankings, or availability.',
  },
  treatment_planning: {
    id: 'treatment_planning', name: 'TreatmentPlanningAgent', purpose: 'Organize non-clinical treatment travel and coordination steps.',
    allowedTools: ['search_treatments', 'search_hospitals', 'search_doctors', 'search_packages', 'search_countries', 'search_services', 'get_treatment', 'get_hospital', 'get_doctor', 'get_package', 'get_country', 'get_case_documents_metadata', 'create_case', 'update_case', 'create_agent_task', 'request_external_action', ...common],
    safety: 'Never diagnose, prescribe, determine treatment necessity, or send documents. Case writes need approval.',
  },
  hospital_matching: {
    id: 'hospital_matching', name: 'HospitalMatchingAgent', purpose: 'Match hospitals against available structured criteria.',
    allowedTools: ['search_hospitals', 'search_treatments', 'search_packages', 'get_hospital', 'get_treatment', ...common],
    safety: 'Describe criteria matches only. Never claim best, safest, success rates, or guaranteed outcomes.',
  },
  comparison: {
    id: 'comparison', name: 'ComparisonAgent', purpose: 'Compare catalog options and available estimates.',
    allowedTools: ['compare_treatment_options', 'search_treatments', 'search_countries', 'search_hospitals', 'search_packages', 'get_treatment', 'get_country', ...common],
    safety: 'Separate catalog facts, estimates, missing data, and user-specific questions. Never fabricate costs.',
  },
};
