import type { Metadata } from 'next';
import { AssistantExperience } from '@/components/assistant/assistant-experience';
import { isAgentConfigured } from '@/lib/agents/persistence';
import './assistant.css';

export const metadata: Metadata = { title: 'MedBridge AI', description: 'Plan and explore care options with MedBridge.' };
export const dynamic = 'force-dynamic';

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ q?: string; conversation?: string; start?: string }> }) {
  const { q, conversation, start } = await searchParams;
  return <main id="main-content" tabIndex={-1} className="assistant-page container">
    <AssistantExperience key={`${q??''}:${conversation??''}`} configured={isAgentConfigured()} initialRequest={typeof q === 'string' ? q.slice(0, 2000) : ''} autoStart={start==='1'} initialConversation={conversation&&/^[0-9a-f-]{36}$/.test(conversation)?conversation:undefined} />
  </main>;
}
