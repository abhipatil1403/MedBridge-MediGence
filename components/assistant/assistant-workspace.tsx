'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import Link from 'next/link';
import type { AgentResponse } from '@/lib/agents/schemas';

type Conversation = { id: string; title: string; case_id: string | null; updated_at: string };
type Case = { id: string; title: string; status: string; agentConsent: boolean; canManageConsent: boolean };
type Message = { id: string; role: string; content: string; metadata: { response?: AgentResponse; approvalStatus?: string }; created_at: string };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function AssistantWorkspace({ configured }: { configured: boolean }) {
  const auth = useMemo(() => url && key ? createClient(url, key) : null, []);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [content, setContent] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [caseId, setCaseId] = useState<string>('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [latest, setLatest] = useState<AgentResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const activeUser = useRef<string | undefined>(undefined);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const token = session?.access_token;
    if (!token) throw new Error('Sign in to continue.');
    const response = await fetch(path, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The workspace is unavailable.');
    return data;
  }, [session]);

  const refresh = useCallback(async (selectedId?: string) => {
    if (!session) return;
    const userId = session.user.id;
    try {
      const data = await api(`/api/assistant${selectedId ? `?conversationId=${encodeURIComponent(selectedId)}` : ''}`);
      if (activeUser.current !== userId) return;
      setConversations(data.conversations);
      setCases(data.cases);
      if (selectedId) {
        setMessages(data.messages);
        const final = [...(data.messages as Message[])].reverse().find((message) => message.role === 'assistant' && message.metadata?.response);
        setLatest(final?.metadata.response ?? null);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The workspace is unavailable.'); }
  }, [api, session]);

  useEffect(() => {
    if (!auth) return;
    function applySession(next: Session | null) {
      const nextUser = next?.user.id;
      if (activeUser.current !== nextUser) {
        setConversationId(undefined); setCaseId(''); setMessages([]); setLatest(null); setConversations([]); setCases([]);
      }
      activeUser.current = nextUser;
      setSession(next);
    }
    auth.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: subscription } = auth.auth.onAuthStateChange((_event, next) => applySession(next));
    return () => subscription.subscription.unsubscribe();
  }, [auth]);
  useEffect(() => {
    if (!session || !configured) return;
    const timer = setTimeout(() => void refresh(conversationId), 0);
    return () => clearTimeout(timer);
  }, [session, configured, conversationId, refresh]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setNotice(''); setBusy(true);
    try {
      if (!codeSent) {
        const { error } = await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/assistant` } });
        if (error) throw error;
        setCodeSent(true); setNotice('Check your email for a sign-in link or code.');
      } else {
        const { error } = await auth.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
        if (error) throw error;
        setNotice('');
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true); setNotice('');
    const text = content.trim();
    try {
      const result: AgentResponse = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ content: text, conversationId, caseId: caseId || undefined }) });
      setConversationId(result.conversationId);
      setLatest(result);
      setContent('');
      await refresh(result.conversationId);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The assistant could not run.'); }
    finally { setBusy(false); }
  }

  async function changeConsent(selectedCase: Case) {
    setBusy(true); setNotice('');
    try {
      await api('/api/assistant/consent', { method: 'POST', body: JSON.stringify({ caseId: selectedCase.id, decision: selectedCase.agentConsent ? 'revoked' : 'granted' }) });
      await refresh(conversationId);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Consent could not be saved.'); }
    finally { setBusy(false); }
  }

  async function decideApproval(actionId: string, decision: 'approved' | 'rejected') {
    setBusy(true); setNotice('');
    try {
      const result = await api('/api/assistant/approvals', { method: 'POST', body: JSON.stringify({ actionId, decision }) });
      await refresh(conversationId);
      setNotice(result.status === 'completed' ? 'The approved workspace change was completed.' : 'The proposed change was rejected.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Approval could not be saved.'); }
    finally { setBusy(false); }
  }

  if (!configured) return <section className="assistant-state" role="status"><h2>Assistant configuration needed</h2>
    <p>Care workspace runs require server-side <code>OPENAI_API_KEY</code>, <code>OPENAI_MODEL</code>, and <code>SUPABASE_SECRET_KEY</code>, plus the conversation migration. Add these in your local or deployment environment, then reload this page.</p>
    <Link href="/discover">Explore the catalog meanwhile →</Link></section>;

  if (!session) return <section className="assistant-state assistant-signin"><div><p className="eyebrow">PRIVATE WORKSPACE</p><h2>Sign in to begin</h2>
    <p>Your conversations are saved to your account. Case information is used only when you select a case and grant assistant consent.</p></div>
    <form onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
      {codeSent && <label>Email code<input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></label>}
      <button type="submit" className="button" disabled={busy}>{codeSent ? 'Verify code' : 'Send sign-in code'}</button>
      {notice && <p role="status">{notice}</p>}</form></section>;

  const selectedCase = cases.find((item) => item.id === caseId);
  return <div className="assistant-shell">
    <aside className="assistant-rail" aria-label="Conversations"><div className="assistant-rail__head"><h2>Workspace</h2>
      <button type="button" onClick={() => { setConversationId(undefined); setCaseId(''); setMessages([]); setLatest(null); setNotice(''); }}>New conversation</button></div>
      <div className="assistant-rail__list">{conversations.map((item) => <button key={item.id} type="button" className={item.id === conversationId ? 'active' : ''}
        onClick={() => { setConversationId(item.id); setCaseId(item.case_id ?? ''); setLatest(null); }}>{item.title}<small>{new Date(item.updated_at).toLocaleDateString()}</small></button>)}</div>
      <button type="button" className="assistant-signout" onClick={() => auth?.auth.signOut()}>Sign out</button></aside>

    <section className="assistant-main" aria-label="Care conversation">
      <div className="assistant-main__intro"><span className="eyebrow">CARE COORDINATION</span><h2>{conversationId ? 'Your conversation' : 'What can we help you explore?'}</h2>
        <p>Searches use MedBridge catalog records. Demo providers, costs, and packages are labelled below.</p></div>
      <div className="assistant-messages" aria-live="polite">{messages.length === 0 && <div className="assistant-empty"><p>Try a specific care planning request:</p>
        {['I need a cardiologist in India.', 'Find hospitals for knee replacement in Mumbai.', 'Compare knee replacement in India and Turkey.'].map((example) =>
          <button key={example} type="button" onClick={() => setContent(example)}>{example}</button>)}</div>}
        {messages.map((message) => <article key={message.id} className={`assistant-message assistant-message--${message.role}`}>
          <span>{message.role === 'user' ? 'You' : 'MedBridge'}</span>
          {message.role === 'assistant' && message.metadata?.response ? <ResponseBlocks response={message.metadata.response} approvalStatus={message.metadata.approvalStatus}
            onDecision={decideApproval} disabled={busy} /> : <p>{message.content}</p>}
        </article>)}
        {busy && <div className="assistant-working" role="status">Working on your request. Results and recorded task states will appear when the run finishes.</div>}
      </div>
      <form className="assistant-composer" onSubmit={send}><label htmlFor="assistant-input">Your request</label>
        <textarea id="assistant-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Tell us what you are looking for…" rows={3} maxLength={2000} disabled={busy} required />
        <div><small>For discovery and coordination. A clinician must assess symptoms and treatment decisions.</small><button className="button" type="submit" disabled={busy || !content.trim()}>{busy ? 'Working…' : 'Plan my next step'}</button></div>
        {notice && <p className="assistant-error" role="alert">{notice}</p>}</form>
    </section>

    <aside className="assistant-context" aria-label="Plan and case context"><div className="assistant-context__panel"><p className="eyebrow">CASE CONTEXT</p><h2>Scope this conversation</h2>
      <label htmlFor="case-select">Case<select id="case-select" value={caseId} disabled={Boolean(conversationId) || busy} onChange={(event) => setCaseId(event.target.value)}>
        <option value="">No case — catalog only</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {selectedCase && <><p>{selectedCase.agentConsent ? 'Assistant access granted for this case.' : 'Case owner consent is needed before the assistant reads this case.'}</p>
        {selectedCase.canManageConsent && <button type="button" disabled={busy} onClick={() => changeConsent(selectedCase)}>{selectedCase.agentConsent ? 'Revoke assistant consent' : 'Grant assistant consent'}</button>}</>}
      <small>Case information stays within the selected conversation. Document contents are not sent to the assistant.</small></div>
      <div className="assistant-context__panel"><p className="eyebrow">CURRENT PLAN</p><h2>{latest ? agentsLabel(latest.agent) : 'No run yet'}</h2>
        {latest ? <ol className="assistant-task-list">{latest.tasks.map((task) => <li key={task.id}><strong>{task.objective}</strong><span>{task.status.replaceAll('_', ' ')}</span></li>)}</ol>
          : <p>Actual tasks appear here after a request runs.</p>}</div>
      <div className="assistant-context__panel"><p className="eyebrow">FINDINGS</p><strong>{latest?.findings.length ?? 0} sourced records</strong>
        <p>Source labels reflect each catalog record. Synthetic records are demo data.</p></div>
    </aside>
  </div>;
}

function agentsLabel(agent: AgentResponse['agent']) {
  return ({ discovery: 'Discovery agent', treatment_planning: 'Treatment planning agent', hospital_matching: 'Hospital matching agent', comparison: 'Comparison agent' })[agent];
}

function ResponseBlocks({ response, approvalStatus, onDecision, disabled }: { response: AgentResponse; approvalStatus?: string;
  onDecision: (actionId: string, decision: 'approved' | 'rejected') => void; disabled: boolean }) {
  return <div className="assistant-response"><div><small>WHAT I UNDERSTOOD</small><p>{response.understanding}</p></div>
    <div><small>FINDINGS</small><p>{response.summary}</p>
      {response.findings.length > 0 && <div className="assistant-finding-grid">{response.findings.map((item) => <article key={item.provenance.recordId} className="assistant-finding">
        <span>{item.kind.replaceAll('_', ' ')}</span><h3>{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}</h3><p>{item.detail}</p>
        {Object.entries(item.facts).slice(0, 4).map(([key, value]) => <div className="assistant-fact" key={key}><strong>{key.replace(/([A-Z])/g, ' $1')}</strong><span>{value}</span></div>)}
        <footer>{item.provenance.sourceKind === 'synthetic' ? 'Demo data' : item.provenance.sourceKind === 'external' ? 'External catalog data' : 'MedBridge data'} · {item.provenance.label} · Record {item.provenance.recordId.slice(0, 8)} · Retrieved {new Date(item.provenance.retrievedAt).toLocaleDateString()}</footer>
      </article>)}</div>}</div>
    {response.question && <div className="assistant-response__question"><small>WHAT I NEED FROM YOU</small><p>{response.question}</p></div>}
    {response.approvalProposal && <div className="assistant-response__approval"><small>PROPOSED ACTION</small><p>{response.approvalProposal.detail}</p>
      {response.approvalProposal.action === 'request_external_action' ? <p>External sharing and bookings are not connected. This request remains pending human review.</p>
        : approvalStatus === 'proposed' && response.approvalId ? <div className="assistant-approval-actions">
          <button type="button" disabled={disabled} onClick={() => onDecision(response.approvalId!, 'approved')}>Approve this change</button>
          <button type="button" disabled={disabled} onClick={() => onDecision(response.approvalId!, 'rejected')}>Reject</button></div>
          : <p>Status: {approvalStatus ?? 'pending'}</p>}</div>}
    {response.nextSteps.length > 0 && <div><small>NEXT STEPS</small><ul>{response.nextSteps.map((step) => <li key={step}>{step}</li>)}</ul></div>}
  </div>;
}
