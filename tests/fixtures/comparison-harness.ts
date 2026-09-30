import { randomUUID } from 'node:crypto';
import { orchestrate } from '@/lib/agents/orchestrator';
import { AgentError } from '@/lib/agents/errors';
import { carePlanSchema, type AgentResponse, type CarePlan } from '@/lib/agents/schemas';
import type { AgentStore } from '@/lib/agents/persistence';
import type { PlanningStore } from '@/lib/agents/treatment-planning/store';
import { SearchService } from '@/lib/discovery/search-service';
import type { ToolDependencies } from '@/lib/agents/tools';
import type { CatalogRepository, CatalogSnapshot, Treatment, Hospital, Doctor, Package } from '@/types/catalog';
import type { LLMProvider } from '@/lib/ai/contracts';
import type { ConversationMessage } from '@/lib/conversation/context';
const userId = randomUUID();
const record = (slug: string, name: string) => ({ recordId: randomUUID(), sourceRecordId: randomUUID(), slug, name,
  aliases: [], description: `${name} synthetic sample record`, demo: true, sourceKind: 'synthetic' as const });
const knee: Treatment = { ...record('knee-replacement', 'Knee Replacement'), specialty: 'Orthopedics', category: 'Surgery', overview: '', procedure: '',
  indications: '', diagnostics: '', recovery: '', typicalStayDays: 5, sampleBaseCostUsd: 5000, countries: ['india'], faqs: [] };
const brain: Treatment = { ...knee, ...record('brain-and-spine-surgery', 'Brain & Spine Surgery'), aliases: ['brain surgery'], specialty: 'Neurology' };
const hospital: Hospital = { ...record('mumbai-demo', 'Mumbai Demo Hospital'), city: 'Mumbai', country: 'india', specialties: ['Orthopedics'],
  treatmentSlugs: ['knee-replacement'], sampleBedCount: 20, sampleAccreditation: '', verification: 'Demo — unverified', infrastructure: [] };
const doctor: Doctor = { ...record('knee-doctor', 'Demo Knee Doctor'), city: 'Mumbai', country: 'india', specialty: 'Orthopedics',
  treatmentSlugs: ['knee-replacement'], hospitalSlug: hospital.slug, hospitalName: hospital.name, sampleExperienceYears: 10, languages: ['English'],
  consultationMode: 'both', verification: 'Demo — unverified', qualifications: [] };
const cardiologist: Doctor = { ...doctor, ...record('heart-doctor', 'Demo Cardiologist'), specialty: 'Cardiology', treatmentSlugs: [] };
const pkg: Package = { ...record('knee-package', 'Demo Knee Package'), treatmentSlug: knee.slug, hospitalSlug: hospital.slug, hospitalName: hospital.name,
  country: 'india', durationDays: 6, samplePriceUsd: 5500, inclusions: [], exclusions: [], benefits: [] };
const snapshot: CatalogSnapshot = { treatments: [knee, brain], hospitals: [hospital], doctors: [doctor, cardiologist], packages: [pkg],
  countries: [{ ...record('india', 'India'), code: 'IN', travelNote: '' }], services: [{ ...record('consultation', 'Consultation'), href: '/consultation', category: 'plan', steps: [] }], estimates: [] };
const repository: CatalogRepository = { loadSnapshot: async () => snapshot, listTreatments: async () => snapshot.treatments,
  listHospitals: async () => snapshot.hospitals, listDoctors: async () => snapshot.doctors, listPackages: async () => snapshot.packages,
  listCountries: async () => snapshot.countries, listServices: async () => snapshot.services, listPriceEstimates: async () => [],
  findCandidateSlugs: async () => ({ treatments: new Set(snapshot.treatments.map((item) => item.slug)), hospitals: new Set([hospital.slug]), doctors: new Set(snapshot.doctors.map((item) => item.slug)),
    packages: new Set([pkg.slug]), countries: new Set(['india']), services: new Set(['consultation']) }) };
const search = new SearchService(repository);
const tools: ToolDependencies = { repository, search: (query, type, filters) => search.search({ q: query, type, ...filters, sort: 'relevance' }),
  compare: async () => undefined };
const caseAccess = { readContext: async () => ({}), readDocumentMetadata: async () => [] };
const unavailable: LLMProvider = { generateStructured: async () => { throw new AgentError('MODEL_UNAVAILABLE', 'Unavailable'); } };

class MemoryPlanningStore implements PlanningStore {
  plans = new Map<string, CarePlan>(); messages = new Map<string, ConversationMessage[]>(); locks = new Map<string, string>();
  saves = 0;
  async load(conversationId: string, owner: string) { const plan = this.plans.get(conversationId); return plan?.userId === owner ? structuredClone(plan) : undefined; }
  async save(plan: CarePlan, lease: string) {
    if (this.locks.get(plan.conversationId) !== lease) throw new Error('Lease required');
    const existing = this.plans.get(plan.conversationId);
    if (existing && existing.id !== plan.id) throw new Error('Duplicate plan');
    const saved = carePlanSchema.parse(structuredClone(plan)); this.plans.set(plan.conversationId, saved); this.saves++; return saved;
  }
  async acquire(conversationId: string, _owner: string, lease: string) { if (this.locks.has(conversationId)) return false; this.locks.set(conversationId, lease); return true; }
  async release(conversationId: string, lease: string) { if (this.locks.get(conversationId) === lease) this.locks.delete(conversationId); }
  async recentMessages(conversationId: string) { return this.messages.get(conversationId) ?? []; }
}
function harness(provider = unavailable, dependencies = tools) {
  const planningStore = new MemoryPlanningStore(), conversations = new Set<string>(), outputs: AgentResponse[] = [], actions: string[] = [];
  const runLinks: string[] = [], taskLinks: string[] = [];
  const store: AgentStore = {
    createConversation: async () => { const id = randomUUID(); conversations.add(id); return id; },
    assertConversation: async (id) => { if (!conversations.has(id)) throw new AgentError('CONVERSATION_ACCESS_DENIED', 'Denied'); },
    addMessage: async (id, role, content, _runId, metadata) => { const messages = planningStore.messages.get(id) ?? []; messages.push({ role, content, metadata, createdAt: new Date().toISOString() }); planningStore.messages.set(id, messages); },
    startRun: async (_conv, _user, _agent, _case, planId) => { if (planId) runLinks.push(planId); return randomUUID(); },
    createTask: async (_run, _agent, _objective, _tool, _case, taskId) => { if (taskId) taskLinks.push(taskId); return randomUUID(); },
    updateTask: async () => {}, recordAction: async (_run, _task, tool) => { actions.push(tool); return undefined; },
    saveOutput: async (_run, response) => { outputs.push(response); }, finishRun: async () => {},
  };
  const send = (content: string, conversationId?: string) => orchestrate({ content, conversationId }, { userId, planningStore, store, tools: dependencies, provider, caseAccess });
  return { send, planningStore, store, outputs, actions, runLinks, taskLinks };
}


export { harness, snapshot, tools, unavailable, userId, hospital, pkg };
