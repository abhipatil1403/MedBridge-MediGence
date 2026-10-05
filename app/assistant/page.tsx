import type { Metadata } from 'next';
import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';
import { isAgentConfigured } from '@/lib/agents/persistence';
import './assistant.css';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Care workspace', description: 'Plan and explore care options with MedBridge.' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ q?: string; conversation?: string }> }) {
  const { q, conversation } = await searchParams;
  return <main id="main-content" tabIndex={-1} className="assistant-page container">
    <PageHeader eyebrow="PLAN YOUR NEXT STEP" title="Care Workspace" description="Find care options, check provider information, and keep your next steps together." />
    <AssistantWorkspace key={`${q??''}:${conversation??''}`} configured={isAgentConfigured()} initialRequest={typeof q === 'string' ? q.slice(0, 2000) : ''} initialConversation={conversation&&/^[0-9a-f-]{36}$/.test(conversation)?conversation:undefined} />
  </main>;
}
