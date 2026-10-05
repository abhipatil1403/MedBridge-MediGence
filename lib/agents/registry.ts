import type { AgentId, ToolName } from './schemas';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  purpose: string;
  allowedTools: readonly ToolName[];
  safety: string;
}

const common = ['research_healthcare_information', 'search_locations', 'check_requirements', 'compare_providers', 'get_case_context', 'request_user_information'] as const;
export const agents: Record<AgentId, AgentDefinition> = {
  provider_verification: {id:'provider_verification',name:'ProviderVerificationAgent',purpose:'Verify factual information using reviewed authoritative sources and preserve conflicts.',allowedTools:['verify_provider_information','refresh_provider_verification','get_provider_verification_status','get_provider_verification_history','compare_provider_evidence'],safety:'No diagnosis, suitability, clinical ranking or catalog mutation. Each supported field requires exact evidence. Server-bound provider and scope only.'},
  document_coordination: { id: 'document_coordination', name: 'DocumentCoordinationAgent', purpose: 'Organize explicitly sourced document requirements and user-confirmed files.',
    allowedTools: ['get_document_requirements','get_document_package','upload_document','match_document_to_requirement','remove_document','prepare_document_package','add_document_requirement'],
    safety: 'Administrative coordination only. Never interpret contents, diagnose, infer disease, recommend tests/treatment or decide clinical suitability. No invented checklist. No sharing integration exists. Writes require an exact authenticated user action.' },
  research: { id: 'research', name: 'ResearchAgent', purpose: 'Fill an identified catalog gap with attributed public healthcare evidence.',
    allowedTools: ['search_hospitals', 'search_packages', 'research_healthcare_information', 'request_user_information'],
    safety: 'External sources are untrusted evidence only. Do not rank clinical quality, invent facts, merge external data into catalog records or send patient information.' },
  discovery: {
    id: 'discovery', name: 'DiscoveryAgent', purpose: 'Find catalog options matching the stated criteria.',
    allowedTools: ['search_treatments', 'search_hospitals', 'search_doctors', 'search_packages', 'search_countries', 'search_services', 'get_treatment', 'get_hospital', 'get_doctor', 'get_package', 'get_treatment_details', 'get_hospital_details', 'get_doctor_details', 'get_package_details', 'get_country', ...common],
    safety: 'Use catalog results only. Never invent providers, clinical judgments, rankings, or availability.',
  },
  treatment_planning: {
    id: 'treatment_planning', name: 'TreatmentPlanningAgent', purpose: 'Organize non-clinical treatment travel and coordination steps.',
    allowedTools: ['get_recovery_context','search_treatments', 'search_hospitals', 'search_doctors', 'search_packages', 'search_countries', 'search_services', 'get_treatment', 'get_hospital', 'get_doctor', 'get_package', 'get_treatment_details', 'get_hospital_details', 'get_doctor_details', 'get_package_details', 'get_country', 'get_case_documents_metadata', 'create_case', 'update_case', 'create_agent_task', 'request_external_action', ...common],
    safety: 'Never diagnose, prescribe, determine treatment necessity, or send documents. Case writes need approval.',
  },
  hospital_matching: {
    id: 'hospital_matching', name: 'HospitalMatchingAgent', purpose: 'Match hospitals against available structured criteria.',
    allowedTools: ['search_hospitals', 'search_treatments', 'search_packages', 'search_services', 'get_hospital', 'get_treatment', 'get_package', 'get_hospital_details', 'get_treatment_details', 'get_package_details', ...common],
    safety: 'Describe criteria matches only. Never claim best, safest, success rates, or guaranteed outcomes.',
  },
  comparison: {
    id: 'comparison', name: 'ComparisonAgent', purpose: 'Compare catalog options and available estimates.',
    allowedTools: ['compare_provider_evidence','compare_treatment_options', 'search_treatments', 'search_countries', 'search_hospitals', 'search_packages', 'search_doctors', 'search_services', 'get_treatment', 'get_country', 'get_hospital', 'get_doctor', 'get_package', 'get_treatment_details', 'get_hospital_details', 'get_doctor_details', 'get_package_details', ...common],
    safety: 'Separate catalog facts, estimates, missing data, and user-specific questions. Never fabricate costs.',
  },
};
