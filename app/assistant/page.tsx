import type { Metadata } from 'next';
import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';
import { isAgentConfigured } from '@/lib/agents/persistence';
import './assistant.css';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Care workspace', description: 'Plan and explore care options with MedBridge.' };
export const dynamic = 'force-dynamic';

export default function AssistantPage() {
  return <main id="main-content" tabIndex={-1} className="assistant-page container">
    <PageHeader eyebrow="PLAN YOUR NEXT STEP" title="Care Workspace" description="Find care options, check provider information, and keep your next steps together." />
    <AssistantWorkspace configured={isAgentConfigured()} />
  </main>;
}
