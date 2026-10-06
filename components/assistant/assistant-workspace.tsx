'use client';
import { trapDialogFocus } from "@/components/dialog-focus";
import { MedBridgeLogo } from '@/components/medbridge-logo';
import { useSubmittedRequest } from './use-submitted-request';
import { LocalDate } from '@/components/experience/translation';
import { useExperience } from '@/components/experience/provider';

import { Localized } from '@/components/experience/localized';


import { T } from '@/components/experience/translation';
import { ResearchResults } from './research-results';
import { CoordinationResults } from '@/components/experience/coordination-results';
import { VerificationResults } from './verification-results';
import { DocumentPanel } from './document-panel';
import { FindingsSummary, RequestUnderstanding } from './response-presentation';
import { HospitalMatchResults } from './hospital-match-results';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import Link from 'next/link';
import { ClarificationQuestion, visibleText } from './response-status';
import type { RunActivity } from '@/lib/agents/execution-schemas';
import type { AgentResponse, CarePlan } from '@/lib/agents/schemas';
import { CarePlanPanel } from './care-plan-panel';
import { FindingCards, PlanningResultGroups } from './catalog-results';
import { ComparisonResults } from './comparison-results';
import { CasePanel, CaseSummaryContent } from './case-panel';

type Conversation = { id: string; title: string; case_id: string | null; updated_at: string };
type Case = { id: string; title: string; status: string; agentConsent: boolean; canManageConsent: boolean };
type Message = { id: string; role: string; content: string; metadata: { response?: AgentResponse; approvalStatus?: string }; created_at: string };

export function AssistantWorkspace({ configured, initialRequest = '', initialConversation, autoStart=false }: { configured: boolean; initialRequest?: string; initialConversation?: string;autoStart?:boolean }) {
  const historyDialog=useRef<HTMLDialogElement>(null);
  const {preferences,session:initialSession}=useExperience();
  const auth = useMemo(() => getBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(initialSession);
  const [sessionReady,setSessionReady]=useState(false);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [content, setContent] = useState(initialRequest);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversation);
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
        setActivity(undefined); setConversationId(initialConversation??restored?.id); setCaseId(restored?.caseId ?? ''); setMessages([]); setLatest(null); setCarePlan(undefined); setConversations([]); setCases([]);
      }
      activeUser.current = nextUser;
      setSession(next);
      setSessionReady(true);
    }
    auth.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: subscription } = auth.auth.onAuthStateChange((_event, next) => applySession(next));
    return () => subscription.subscription.unsubscribe();
  }, [auth, initialRequest, initialConversation]);
  useEffect(() => {
    if (!sessionReady || !session) return;
    const key = `medbridge-active-conversation:${session.user.id}`;
    if (conversationId) localStorage.setItem(key, JSON.stringify({ id: conversationId, caseId }));
    else localStorage.removeItem(key);
    const url = new URL(window.location.href);
    if (conversationId) {
      url.searchParams.set('conversation', conversationId);
      url.searchParams.delete('q');
      url.searchParams.delete('start');
    } else url.searchParams.delete('conversation');
    window.history.replaceState(window.history.state, '', url);
  }, [conversationId, caseId, session, sessionReady]);
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
    const pendingId=crypto.randomUUID();
    setMessages(current=>[...current,{id:pendingId,role:'user',content:text,metadata:{},created_at:new Date().toISOString()}]);
    requestStarted.current = new Set(conversations.map((c) => c.id));
    setActivity(undefined); setBusy(true); setNotice('');
    try {
      const result: AgentResponse = await api('/api/assistant', { method: 'POST', body: JSON.stringify({ content: text, conversationId, caseId: caseId || undefined,displayCurrency:preferences.currency }) });
      if (activeUser.current !== ownerAtStart) return;
      setConversationId(result.conversationId);
      setActivity(result.activity);
      setLatest(result);
      setCarePlan(result.plan);
      setContent(result.status === 'failed' ? text : '');
      await refresh(result.conversationId);
    } catch (error) { if(activeUser.current===ownerAtStart){setMessages(current=>current.filter(message=>message.id!==pendingId));setNotice(error instanceof Error ? error.message : 'The assistant could not run.');} }
    finally { requestStarted.current = undefined; setBusy(false); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    await submitRequest(content.trim());
  }
  useSubmittedRequest(sessionReady&&Boolean(session)&&configured&&!busy,autoStart,initialRequest,submitRequest);

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

  if (!configured) return <section className="assistant-state" role="status"><h2><T>{"MedBridge AI is temporarily unavailable"}</T></h2>
    <p><T>{"Please try again later. You can continue exploring care options through search."}</T></p>
    <Link href="/discover"><T>{"Explore care options →"}</T></Link></section>;

  if (!session) return <section className="assistant-state assistant-signin"><div><p className="eyebrow"><T>{"PRIVATE WORKSPACE"}</T></p><h2><T>{"Sign in to begin"}</T></h2>
    <p><T>{"Keep your research, sources and next steps in one private conversation."}</T></p>{initialRequest && <div className="signin-request"><span className="eyebrow"><T>{"YOUR REQUEST IS READY"}</T></span><p>{initialRequest}</p><small><T>{"Sign in, then review and send it."}</T></small></div>}<small><T>{"Case information is used only with your consent. Documents are not sent to the assistant."}</T></small></div>
    <form onSubmit={signIn}><label><T>{"Email address"}</T><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setLinkSent(false); }} autoComplete="email" required /></label>
      <button type="submit" className="button button--primary" disabled={busy}><T>{linkSent ? 'Send another sign-in link' : 'Send sign-in link'}</T></button>
      {notice && <p role="status">{notice}</p>}</form></section>;

  const selectedCase = cases.find((item) => item.id === caseId);
  const latestRequest = [...messages].reverse().find((message) => message.role === 'user')?.content;
  return <div className="assistant-shell" data-empty={messages.length===0&&!busy}>
    <div className="assistant-history-toggle"><button type="button" aria-haspopup="dialog" onClick={()=>historyDialog.current?.showModal()}><T>{'Conversations'}</T>{' · '}{conversations.length}</button><dialog onKeyDown={trapDialogFocus} ref={historyDialog} className="assistant-history-dialog" aria-labelledby="conversation-history-title"><button type="button" className="save-control" onClick={()=>historyDialog.current?.close()}><T>{'Close conversations'}</T></button>
    <Localized as="aside" className="assistant-rail" aria-label="Conversations"><div className="assistant-rail__head"><p className="eyebrow"><T>{"YOUR WORKSPACE"}</T></p><h2 id="conversation-history-title"><T>{"Conversations"}</T></h2>
      <button type="button" disabled={busy} onClick={() => { setActivity(undefined); setConversationId(undefined); setCaseId(''); setMessages([]); setLatest(null); setCarePlan(undefined); setNotice(''); historyDialog.current?.close(); }}><T>{"New conversation"}</T></button></div>
      <details className="assistant-conversations" open><summary><T>{"Recent ·"}</T>{' '}{conversations.length}</summary><div className="assistant-rail__list">{conversations.length === 0 && <p className="editorial-note"><T>{"Your saved requests will appear here."}</T></p>}{conversations.map((item) => <button key={item.id} type="button" className={item.id === conversationId ? 'active' : ''}
        aria-pressed={item.id === conversationId} disabled={busy} onClick={() => { setActivity(undefined); setConversationId(item.id); setCaseId(item.case_id ?? ''); setLatest(null); setCarePlan(undefined); historyDialog.current?.close(); }}>{item.title}<small><LocalDate value={item.updated_at}/></small></button>)}</div></details>
      <button type="button" className="assistant-signout" onClick={() => auth?.auth.signOut()}><T>{"Sign out"}</T></button></Localized></dialog></div>

    <Localized as="section" className="assistant-main" aria-label="Care conversation">
      <div className="assistant-first-use"><MedBridgeLogo compact/><p className="eyebrow">MEDBRIDGE AI</p><h1 className="ai-landing-title"><T>{'What are you trying to figure out?'}</T></h1><p><T>{'Tell me what you’re looking for. I can help you explore healthcare options, compare what is available and organize the next step.'}</T></p></div>
      <div className="assistant-main__intro"><span className="eyebrow">MEDBRIDGE AI</span><h1><T>{'Your conversation'}</T></h1>
        <p><T>{conversationId ? 'Findings, evidence and next steps, together.' : 'Tell MedBridge what you’re trying to figure out.'}</T></p></div>


      <div className="assistant-messages" aria-live="polite">
        {messages.map((message) => <article key={message.id} className={`assistant-message assistant-message--${message.role}`}>
          <span><T>{message.role === 'user' ? 'You' : 'MedBridge'}</T></span>
          {message.role === 'assistant' && message.metadata?.response ? <ResponseBlocks response={message.metadata.response} approvalStatus={message.metadata.approvalStatus}
            onDecision={decideApproval} onRetry={latest?.runId === message.metadata.response.runId && latestRequest ? () => { void submitRequest(latestRequest); } : undefined}
            disabled={busy} onRequest={text=>{void submitRequest(text);}} /> : <p>{message.content}</p>}
        </article>)}

        {busy && <div className="assistant-working" role="status"><T>{'MedBridge AI is checking published options…'}</T></div>}
      </div>
      <form className="assistant-composer" onSubmit={send}><label htmlFor="assistant-input"><T>{messages.length ? 'Ask a follow-up' : 'What are you looking for?'}</T></label>
        <textarea id="assistant-input" value={content} onChange={(event) => setContent(event.target.value)} placeholder={messages.length ? 'Ask about these options, evidence or next steps…' : 'Treatment, location, budget — start in your own words…'} rows={3} maxLength={2000} disabled={busy} required />
        <div><small><T>{"For discovery and coordination. A clinician must assess symptoms and treatment decisions."}</T></small><button className="button button--primary" type="submit" disabled={busy || !content.trim()}><T>{busy ? 'Working…' : messages.length?'Send':'Ask MedBridge AI'}</T>{' →'}</button></div>
        {notice && <p className="assistant-error" role="alert">{notice}</p>}</form>
      {messages.length === 0 && <div className="assistant-empty"><p className="eyebrow"><T>{"A FEW STARTING POINTS"}</T></p>
        <div className="ai-prompts">{[['Find a hospital','Find hospitals for knee replacement in Mumbai.'],['Find a doctor','Find a cardiologist in Pune.'],['Explore treatments','Show published treatments.'],['Compare destinations','Compare knee replacement in India and Singapore.'],['Find packages','Show health checkup packages under ₹5 lakh.']].map(([label,example]) =>
          <button key={label} type="button" onClick={() => setContent(example)}><T>{label}</T></button>)}</div></div>}
      <div className="assistant-support">
            <details className="assistant-case-context" open={Boolean(selectedCase)}><summary>{selectedCase ? `Linked case · ${selectedCase.title}` : "Case context · optional"}</summary>
      <label htmlFor="case-select"><T>{"Case"}</T><select id="case-select" value={caseId} disabled={Boolean(conversationId) || busy} onChange={(event) => setCaseId(event.target.value)}>
        <option value=""><T>{"No linked case record"}</T></option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {selectedCase && <><p><T>{selectedCase.agentConsent ? 'Assistant access granted for this case.' : 'Case owner consent is needed before the assistant reads this case.'}</T></p>
        {selectedCase.canManageConsent && <button type="button" disabled={busy} onClick={() => changeConsent(selectedCase)}><T>{selectedCase.agentConsent ? 'Revoke assistant consent' : 'Grant assistant consent'}</T></button>}</>}
      <small><T>{"Case information stays within the selected conversation. Document contents are not sent to the assistant."}</T></small></details>
      <DocumentPanel key={`${session.user.id}:${conversationId??'new'}`} token={session.access_token} conversationId={conversationId} disabled={busy} contextual={latest?.agent === 'document_coordination'}
        onResponse={async response=>{setConversationId(response.conversationId);setLatest(response);setActivity(response.activity);await refresh(response.conversationId);}} />
      {carePlan?.context.patientCase && <details className="assistant-support__section" open={latest?.workflow === 'case_intake'}><summary><T>{"Your saved case"}</T></summary><CasePanel draft={carePlan.context.patientCase} busy={busy} onAction={(text) => { void submitRequest(text); }} /></details>}
      {carePlan && <details className="assistant-support__section"><summary><T>{"Saved care plan · tasks and progress"}</T></summary><CarePlanPanel plan={carePlan} busy={busy} onTaskAction={completePlanTask} /></details>}
      </div>
    </Localized>

  </div>;
}

export function ResponseBlocks({ response, approvalStatus, onDecision, onRetry, onRequest, disabled }: { response: AgentResponse; approvalStatus?: string;
  onDecision: (actionId: string, decision: 'approved' | 'rejected') => void; onRetry?: () => void; onRequest?:(content:string)=>void; disabled: boolean }) {
  const hospitals=response.findings.filter(item=>item.kind==='hospitals'),packages=response.findings.filter(item=>item.kind==='packages');
  const followUps: {label:string;question:string}[]=[];
  if(!response.question&&response.status!=='failed'&&!response.verification&&!response.approvalProposal){
    if(packages.length){
      if(packages.length>1)followUps.push({label:'Compare these packages',question:`Compare ${packages[0].title} and ${packages[1].title}.`});
      followUps.push({label:'Check accommodation',question:`Does ${packages[0].title} include accommodation?`});
    }else if(hospitals.length){
      if(hospitals.length>1)followUps.push({label:'Compare these hospitals',question:`Compare ${hospitals[0].title} and ${hospitals[1].title}.`});
      followUps.push({label:'Check available packages',question:`Show packages for ${hospitals[0].title}.`});
    }
  }
  return <div className="assistant-response">
    {Boolean(response.requirements?.length)&&<details><summary><T>{'Why these results?'}</T></summary><RequestUnderstanding response={response} /></details>}
    {response.coordination&&<CoordinationResults context={response.coordination}/>}
    {response.workflow === 'case_intake' && response.caseSummary && <CaseSummaryContent summary={response.caseSummary} />}
    {response.caseHandoff && <p><T>{"Using the reviewed case for catalog coordination. Reported medical information is separate from search requirements and does not establish treatment suitability. No case has been submitted to a provider."}</T></p>}
    {response.agent === 'document_coordination' ? <p>{response.summary}</p> : <FindingsSummary response={response} />}
    {response.verification && <VerificationResults result={response.verification} onRequest={onRequest} disabled={disabled} />}
    <div className="assistant-catalog-results">
      {response.research && response.findings.length > 0 && <h3 className="assistant-section-title"><T>{'Published options'}</T></h3>}
      {response.status === 'failed' && <div className="assistant-recovery">{onRetry && <button type="button" disabled={disabled} onClick={onRetry}><T>{"Retry this request"}</T></button>}
        <Link href="/discover"><T>{'Continue with search →'}</T></Link></div>}
      {response.comparison ? <ComparisonResults comparison={response.comparison} /> : response.resultGroups?.length ? <PlanningResultGroups groups={response.resultGroups} onRequest={onRequest} disabled={disabled} /> : <FindingCards findings={response.findings} onRequest={onRequest} disabled={disabled} />}</div>
    {response.hospitalMatches && <details className="assistant-evidence-review"><summary><T>{"Hospital matching evidence"}</T></summary><HospitalMatchResults matches={response.hospitalMatches} /></details>}
    {response.comparison && response.resultGroups?.length ? <details><summary><T>{"Options in this comparison"}</T></summary><PlanningResultGroups groups={response.resultGroups} onRequest={onRequest} disabled={disabled} /></details> : null}
    {response.research && <ResearchResults result={response.research} comparison={response.researchComparison} />}

    {response.analyses?.map((analysis, index) => <details className="assistant-evidence-review" key={index}><summary><T>{"CATALOG EVIDENCE REVIEW"}</T></summary><p>{analysis.summary}</p>
      {analysis.missingInformation.length > 0 && <ul>{analysis.missingInformation.map((gap, i) => <li key={i}>{gap}</li>)}</ul>}
      <small><T>{"Derived from"}</T>{' '}{analysis.recordIds.length} <T>{"sourced catalog records ·"}</T><T>{analysis.complete ? 'Evidence review completed' : 'Incomplete evidence'}</T></small></details>)}
    <ClarificationQuestion question={response.question} />
    {response.findings.length > 0 && response.summarySource !== 'model' && <details className="assistant-evidence-review"><summary><T>{"About these results"}</T></summary><p>{response.summary}</p></details>}
    {response.approvalProposal && <div className="assistant-response__approval"><small><T>{"PROPOSED ACTION"}</T></small><p>{response.approvalProposal.detail}</p>
      {response.approvalProposal.action === 'request_external_action' ? <p><T>{"External sharing and bookings are not connected. This request remains pending human review."}</T></p>
        : approvalStatus === 'proposed' && response.approvalId ? <div className="assistant-approval-actions">
          <button type="button" disabled={disabled} onClick={() => onDecision(response.approvalId!, 'approved')}><T>{"Approve this change"}</T></button>
          <button type="button" disabled={disabled} onClick={() => onDecision(response.approvalId!, 'rejected')}><T>{"Reject"}</T></button></div>
          : <p><T>{"Status:"}</T>{' '}{approvalStatus ?? 'pending'}</p>}</div>}
    {response.nextSteps.length > 0 && !response.verification && <div className="assistant-next-steps"><h3><T>{'Your next step'}</T></h3><p><T>{response.nextSteps.find(step=>visibleText(step))==='Review the sourced records and their exact match reasons.'?'Explore these options and check the details that matter to you.':response.nextSteps.find(step=>visibleText(step))??''}</T></p>{onRequest&&followUps.length>0&&<div className="ai-follow-ups">{followUps.slice(0,2).map(item=><button key={item.label} className="save-control" type="button" disabled={disabled} onClick={()=>onRequest(item.question)}><T>{item.label}</T> →</button>)}</div>}{response.nextSteps.length>1&&<details><summary><T>{'More next steps'}</T></summary><ul>{response.nextSteps.slice(1).filter(step=>visibleText(step)).map(step=><li key={step}>{step}</li>)}</ul></details>}</div>}

  </div>;
}
