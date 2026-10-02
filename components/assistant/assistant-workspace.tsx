'use client';

import { ResearchResults } from './research-results';
import { VerificationResults } from './verification-results';
import { DocumentPanel } from './document-panel';
import { FindingsSummary, RequestUnderstanding } from './response-presentation';
import { HospitalMatchResults } from './hospital-match-results';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import Link from 'next/link';
import { ClarificationQuestion, RequestProgress, visibleText } from './response-status';
import { ExecutionActivity } from './execution-activity';
import type { RunActivity } from '@/lib/agents/execution-schemas';
import type { AgentResponse, CarePlan } from '@/lib/agents/schemas';
import { CarePlanPanel } from './care-plan-panel';
import { FindingCards, PlanningResultGroups } from './catalog-results';
import { ComparisonResults } from './comparison-results';
import { CasePanel, CaseSummaryContent } from './case-panel';

type Conversation = { id: string; title: string; case_id: string | null; updated_at: string };
type Case = { id: string; title: string; status: string; agentConsent: boolean; canManageConsent: boolean };
type Message = { id: string; role: string; content: string; metadata: { response?: AgentResponse; approvalStatus?: string }; created_at: string };

export function AssistantWorkspace({ configured, initialRequest = '' }: { configured: boolean; initialRequest?: string }) {
  const auth = useMemo(() => getBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [content, setContent] = useState(initialRequest);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [caseId, setCaseId] = useState<string>('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [latest, setLatest] = useState<AgentResponse | null>(null);
  const [carePlan, setCarePlan] = useState<CarePlan | undefined>();
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<RunActivity | undefined>();
  const requestStarted = useRef<Set<string> | undefined>(undefined);
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
      if (!selectedId && requestStarted.current) {
        const created = (data.conversations as Conversation[]).find((c) => !requestStarted.current!.has(c.id));
        if (created) setConversationId(created.id);
      }
      setCases(data.cases);
      if (selectedId) {
        setActivity(data.activity);
        setCarePlan(data.plan);
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
        const saved = nextUser && !initialRequest ? localStorage.getItem(`medbridge-active-conversation:${nextUser}`) : null;
        let restored: { id?: string; caseId?: string } | undefined;
        try { restored = saved ? JSON.parse(saved) as typeof restored : undefined; } catch { /* Ignore a stale browser preference. */ }
        setActivity(undefined); setConversationId(restored?.id); setCaseId(restored?.caseId ?? ''); setMessages([]); setLatest(null); setCarePlan(undefined); setConversations([]); setCases([]);
      }
      activeUser.current = nextUser;
      setSession(next);
    }
    auth.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: subscription } = auth.auth.onAuthStateChange((_event, next) => applySession(next));
    return () => subscription.subscription.unsubscribe();
  }, [auth, initialRequest]);
  useEffect(() => {
    if (!session) return;
    const key = `medbridge-active-conversation:${session.user.id}`;
    if (conversationId) localStorage.setItem(key, JSON.stringify({ id: conversationId, caseId }));
    else localStorage.removeItem(key);
  }, [conversationId, caseId, session]);
  useEffect(() => {
    if (!session || !configured) return;
    const timer = setTimeout(() => void refresh(conversationId), 0);
    return () => clearTimeout(timer);
  }, [session, configured, conversationId, refresh]);

  useEffect(() => {
    if (!session || !configured || (!busy && (!activity || ['completed', 'partially_completed', 'failed', 'cancelled', 'waiting_for_input', 'awaiting_confirmation'].includes(activity.state)))) return;
    const timer = setInterval(() => void refresh(conversationId), 2500);
    return () => clearInterval(timer);
  }, [session, configured, busy, activity, refresh, conversationId]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setNotice(''); setBusy(true);
    try {
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('next', `${window.location.pathname}${window.location.search}${window.location.hash}`);
      const { error } = await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: callback.toString() } });
      if (error) throw error;
      setLinkSent(true); setNotice('Check your email and open the sign-in link. You do not need a code.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  async function submitRequest(text: string) {
    if (!text || busy) return;
    const ownerAtStart = session?.user.id;
    requestStarted.current = new Set(conversations.map((c) => c.id));
    setActivity(undefined); setBusy(true); setNotice('');
    try {
      const result: AgentResponse = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ content: text, conversationId, caseId: caseId || undefined }) });
      if (activeUser.current !== ownerAtStart) return;
      setConversationId(result.conversationId);
      setActivity(result.activity);
      setLatest(result);
      setCarePlan(result.plan);
      setContent(result.status === 'failed' ? text : '');
      await refresh(result.conversationId);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The assistant could not run.'); }
    finally { requestStarted.current = undefined; setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    await submitRequest(content.trim());
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

  async function completePlanTask(taskId: string, action: 'complete' | 'reopen') {
    if (!carePlan || busy) return;
    setBusy(true); setNotice('');
    try {
      const result = await api('/api/assistant/plan-tasks', { method: 'POST', body: JSON.stringify({
        conversationId: carePlan.conversationId, planId: carePlan.id, taskId, action, caseId: caseId || undefined }) });
      setCarePlan(result.plan);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Your planning progress could not be saved.'); }
    finally { setBusy(false); }
  }

  if (!configured) return <section className="assistant-state" role="status"><h2>Care Workspace is temporarily unavailable</h2>
    <p>Please try again later. You can continue exploring care options through search.</p>
    <Link href="/discover">Explore care options →</Link></section>;

  if (!session) return <section className="assistant-state assistant-signin"><div><p className="eyebrow">PRIVATE WORKSPACE</p><h2>Sign in to begin</h2>
    <p>Keep your research, sources and next steps in one private conversation.</p>{initialRequest && <div className="signin-request"><span className="eyebrow">YOUR REQUEST IS READY</span><p>{initialRequest}</p><small>Sign in, then review and send it.</small></div>}<small>Case information is used only with your consent. Documents are not sent to the assistant.</small></div>
    <form onSubmit={signIn}><label>Email address<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setLinkSent(false); }} autoComplete="email" required /></label>
      <button type="submit" className="button button--primary" disabled={busy}>{linkSent ? 'Send another sign-in link' : 'Send sign-in link'}</button>
      {notice && <p role="status">{notice}</p>}</form></section>;

  const selectedCase = cases.find((item) => item.id === caseId);
  const latestRequest = [...messages].reverse().find((message) => message.role === 'user')?.content;
  return <div className="assistant-shell">
    <aside className="assistant-rail" aria-label="Conversations"><div className="assistant-rail__head"><p className="eyebrow">YOUR WORKSPACE</p><h2>Conversations</h2>
      <button type="button" disabled={busy} onClick={() => { setActivity(undefined); setConversationId(undefined); setCaseId(''); setMessages([]); setLatest(null); setCarePlan(undefined); setNotice(''); }}>New conversation</button></div>
      <details className="assistant-conversations" open><summary>Recent · {conversations.length}</summary><div className="assistant-rail__list">{conversations.length === 0 && <p className="editorial-note">Your saved requests will appear here.</p>}{conversations.map((item) => <button key={item.id} type="button" className={item.id === conversationId ? 'active' : ''}
        aria-pressed={item.id === conversationId} disabled={busy} onClick={() => { setActivity(undefined); setConversationId(item.id); setCaseId(item.case_id ?? ''); setLatest(null); setCarePlan(undefined); }}>{item.title}<small>{new Date(item.updated_at).toLocaleDateString()}</small></button>)}</div></details>
      <button type="button" className="assistant-signout" onClick={() => auth?.auth.signOut()}>Sign out</button></aside>

    <section className="assistant-main" aria-label="Care conversation">
      <div className="assistant-main__intro"><span className="eyebrow">{conversationId ? 'YOUR HEALTHCARE REQUEST' : 'START WITH YOUR QUESTION'}</span><h2>{conversationId ? 'Your conversation' : 'Your journey starts here.'}</h2>
        <p>{conversationId ? 'Findings, evidence and next steps, together.' : 'Tell MedBridge what you’re trying to figure out.'}</p></div>


      <div className="assistant-messages" aria-live="polite">
        {messages.map((message) => <article key={message.id} className={`assistant-message assistant-message--${message.role}`}>
          <span>{message.role === 'user' ? 'You' : 'MedBridge'}</span>
          {message.role === 'assistant' && message.metadata?.response ? <ResponseBlocks response={message.metadata.response} approvalStatus={message.metadata.approvalStatus}
            onDecision={decideApproval} onRetry={latest?.runId === message.metadata.response.runId && latestRequest ? () => { void submitRequest(latestRequest); } : undefined}
            disabled={busy} onRequest={text=>{void submitRequest(text);}} /> : <p>{message.content}</p>}
        </article>)}
        {activity && !messages.some((message) => message.metadata?.response?.runId === activity.runId) && <ExecutionActivity activity={activity} />}
        {busy && !activity && <div className="assistant-working" role="status">Working on your request… Your results will appear here.</div>}
      </div>
      <form className="assistant-composer" onSubmit={send}><label htmlFor="assistant-input">{messages.length ? 'Ask a follow-up' : 'Your request'}</label>
        <textarea id="assistant-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder={messages.length ? 'Ask about these options, evidence or next steps…' : 'Treatment, location, budget — start in your own words…'} rows={3} maxLength={2000} disabled={busy} required />
        <div><small>For discovery and coordination. A clinician must assess symptoms and treatment decisions.</small><button className="button button--primary" type="submit" disabled={busy || !content.trim()}>{busy ? 'Working…' : 'Send request'}</button></div>
        {notice && <p className="assistant-error" role="alert">{notice}</p>}</form>
      {messages.length === 0 && <div className="assistant-empty"><p className="eyebrow">A FEW STARTING POINTS</p>
        {['I need a cardiologist in India.', 'Find hospitals for knee replacement in Mumbai.', 'Compare knee replacement in India and Turkey.'].map((example) =>
          <button key={example} type="button" onClick={() => setContent(example)}>{example}</button>)}</div>}
      <div className="assistant-support">
            <details className="assistant-case-context" open={Boolean(selectedCase)}><summary>{selectedCase ? `Linked case · ${selectedCase.title}` : "Case context · optional"}</summary>
      <label htmlFor="case-select">Case<select id="case-select" value={caseId} disabled={Boolean(conversationId) || busy} onChange={(event) => setCaseId(event.target.value)}>
        <option value="">No linked case record</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {selectedCase && <><p>{selectedCase.agentConsent ? 'Assistant access granted for this case.' : 'Case owner consent is needed before the assistant reads this case.'}</p>
        {selectedCase.canManageConsent && <button type="button" disabled={busy} onClick={() => changeConsent(selectedCase)}>{selectedCase.agentConsent ? 'Revoke assistant consent' : 'Grant assistant consent'}</button>}</>}
      <small>Case information stays within the selected conversation. Document contents are not sent to the assistant.</small></details>
      <DocumentPanel key={`${session.user.id}:${conversationId??'new'}`} token={session.access_token} conversationId={conversationId} disabled={busy} contextual={latest?.agent === 'document_coordination'}
        onResponse={async response=>{setConversationId(response.conversationId);setLatest(response);setActivity(response.activity);await refresh(response.conversationId);}} />
      {carePlan?.context.patientCase && <details className="assistant-support__section" open={latest?.workflow === 'case_intake'}><summary>Your saved case</summary><CasePanel draft={carePlan.context.patientCase} busy={busy} onAction={(text) => { void submitRequest(text); }} /></details>}
      {carePlan && <details className="assistant-support__section"><summary>Saved care plan · tasks and progress</summary><CarePlanPanel plan={carePlan} busy={busy} onTaskAction={completePlanTask} /></details>}
      </div>
    </section>

  </div>;
}

export function ResponseBlocks({ response, approvalStatus, onDecision, onRetry, onRequest, disabled }: { response: AgentResponse; approvalStatus?: string;
  onDecision: (actionId: string, decision: 'approved' | 'rejected') => void; onRetry?: () => void; onRequest?:(content:string)=>void; disabled: boolean }) {
  return <div className="assistant-response">
    <RequestUnderstanding response={response} />
    {response.workflow === 'case_intake' && response.caseSummary && <CaseSummaryContent summary={response.caseSummary} />}
    {response.caseHandoff && <p>Using the reviewed case for catalog coordination. Reported medical information is separate from search requirements and does not establish treatment suitability. No case has been submitted to a provider.</p>}
    {response.agent === 'document_coordination' ? <p>{response.summary}</p> : <FindingsSummary response={response} />}
    {response.verification && <VerificationResults result={response.verification} onRequest={onRequest} disabled={disabled} />}
    <div className="assistant-catalog-results">
      {response.research && response.findings.length > 0 && <h3 className="assistant-section-title">MEDBRIDGE CATALOG</h3>}
      {response.status === 'failed' && <div className="assistant-recovery">{onRetry && <button type="button" disabled={disabled} onClick={onRetry}>Retry this request</button>}
        <Link href="/discover">Continue with standard catalog search →</Link></div>}
      {response.comparison ? <ComparisonResults comparison={response.comparison} /> : response.resultGroups?.length ? <PlanningResultGroups groups={response.resultGroups} onRequest={onRequest} disabled={disabled} /> : <FindingCards findings={response.findings} onRequest={onRequest} disabled={disabled} />}</div>
    {response.hospitalMatches && <details className="assistant-evidence-review"><summary>Hospital matching evidence</summary><HospitalMatchResults matches={response.hospitalMatches} /></details>}
    {response.comparison && response.resultGroups?.length ? <details><summary>Options in this comparison</summary><PlanningResultGroups groups={response.resultGroups} onRequest={onRequest} disabled={disabled} /></details> : null}
    {response.research && <ResearchResults result={response.research} comparison={response.researchComparison} />}

    {response.analyses?.map((analysis, index) => <details className="assistant-evidence-review" key={index}><summary>CATALOG EVIDENCE REVIEW</summary><p>{analysis.summary}</p>
      {analysis.missingInformation.length > 0 && <ul>{analysis.missingInformation.map((gap, i) => <li key={i}>{gap}</li>)}</ul>}
      <small>Derived from {analysis.recordIds.length} sourced catalog records · {analysis.complete ? 'Evidence review completed' : 'Incomplete evidence'}</small></details>)}
    <ClarificationQuestion question={response.question} />
    {response.findings.length > 0 && response.summarySource !== 'model' && <details className="assistant-evidence-review"><summary>About these results</summary><p>{response.summary}</p></details>}
    {response.approvalProposal && <div className="assistant-response__approval"><small>PROPOSED ACTION</small><p>{response.approvalProposal.detail}</p>
      {response.approvalProposal.action === 'request_external_action' ? <p>External sharing and bookings are not connected. This request remains pending human review.</p>
        : approvalStatus === 'proposed' && response.approvalId ? <div className="assistant-approval-actions">
          <button type="button" disabled={disabled} onClick={() => onDecision(response.approvalId!, 'approved')}>Approve this change</button>
          <button type="button" disabled={disabled} onClick={() => onDecision(response.approvalId!, 'rejected')}>Reject</button></div>
          : <p>Status: {approvalStatus ?? 'pending'}</p>}</div>}
    {response.nextSteps.length > 0 && !response.verification && <details className="assistant-next-steps"><summary>Suggested next steps</summary><ul>{response.nextSteps.filter(step => visibleText(step)).map((step) => <li key={step}>{step}</li>)}</ul></details>}
    <RequestProgress request={response.compoundRequest} />
    {response.activity && <ExecutionActivity activity={response.activity} />}
  </div>;
}
