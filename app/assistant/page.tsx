import type { Metadata } from 'next';
import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';
import { isAgentConfigured } from '@/lib/agents/persistence';
import './assistant.css';

export const metadata: Metadata = { title: 'Care workspace', description: 'Plan and explore care options with MedBridge.' };
export const dynamic = 'force-dynamic';

export default function AssistantPage() {
  return <main id="main-content" className="assistant-page container">
    <div className="assistant-page__head"><p className="eyebrow">MEDBRIDGE CARE WORKSPACE</p><h1>Plan the next step in care.</h1>
      <p>Describe what you are exploring. The assistant plans searches, checks the MedBridge catalog, and keeps sources alongside each finding.</p></div>
    <AssistantWorkspace configured={isAgentConfigured()} />
  </main>;
}
