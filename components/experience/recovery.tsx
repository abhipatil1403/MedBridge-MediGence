'use client';
import { InlineSkeleton } from '@/components/inline-skeleton';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useExperience } from './provider';
import { useTranslation, LocalDate } from './translation';
import { SignIn } from './sign-in';
type Journey={id:string;title:string;stage:string;hospital_id:string|null;case_id:string|null};
type Task={id:string;journey_id:string;title:string;status:string;due_at:string|null;completed_at:string|null;support_case_id:string|null};
type Event={id:string;journey_id:string;title:string;event_type:string;occurred_at:string};
type Data={journeys:Journey[];tasks:Task[];events:Event[];hospitals:{id:string;name:string;slug:string}[];files:{id:string;title:string;document_type:string}[];documents:{journey_id:string;document_id:string}[];links:{journey_id:string;support_case_id:string}[];support:{id:string;title:string;status:string}[];cases:{id:string;title:string}[]};
const stages=[['preparation','Preparation'],['after_treatment','After treatment'],['follow_up','Follow-up coordination'],['rehabilitation_coordination','Rehabilitation coordination'],['ongoing','Ongoing coordination'],['archived','Archived']] as const;
export function RecoveryDashboard({initialJourney}:{initialJourney?:string}) {
  const {session,authReady,api}=useExperience(),{t}=useTranslation();
  const [state,setState]=useState<{owner:string;data?:Data;error?:boolean}|null>(null),[selected,setSelected]=useState(initialJourney??''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const owner=session?.user.id;
  const currentOwner=useRef(owner);
  useEffect(()=>{currentOwner.current=owner;},[owner]);
  useEffect(()=>{let alive=true;if(owner)void api('/api/recovery').then(raw=>{if(alive)setState({owner,data:raw as Data});}).catch(()=>{if(alive){setState({owner,error:true});setNotice('Recovery information could not be loaded. Please try again.');}});return()=>{alive=false;};},[owner,api,revision]);
  const data=state&&state.owner===owner?state.data:null;
  const journey=data?.journeys.find(j=>j.id===selected)??data?.journeys[0];
  async function command(input:Record<string,unknown>,form?:HTMLFormElement){
    const account=owner;
    setBusy(true);setNotice('');
    try {const result=await api('/api/recovery',{method:'POST',body:JSON.stringify(input)}) as {id?:string};if(currentOwner.current!==account)return;if(input.action==='create_journey'&&result.id){setSelected(result.id);const disclosure=form?.closest('details');if(disclosure){disclosure.open=false;disclosure.querySelector('summary')?.focus();}}setRevision(v=>v+1);form?.reset();setNotice(input.action==='create_support'?'Support request created. Open Patient Help to follow responses.':'Change saved.');}
    catch{if(currentOwner.current===account)setNotice('This change could not be saved. Check your selection and try again.');}finally{setBusy(false);}
  }
  function submit(e:FormEvent<HTMLFormElement>,action:string){
    e.preventDefault();const form=e.currentTarget,f=new FormData(form),title=String(f.get('title')??'');
    const input:Record<string,unknown>={action,...(action==='create_journey'?{}:{journeyId:journey?.id})};
    if(action==='create_journey'){input.title=title;if(f.get('hospitalId'))input.hospitalId=f.get('hospitalId');if(f.get('caseId'))input.caseId=f.get('caseId');}
    if(action==='add_task'){input.title=title;if(f.get('dueAt'))input.dueAt=new Date(String(f.get('dueAt'))).toISOString();}
    if(action==='add_event'){input.title=title;input.occurredAt=new Date(`${f.get('occurredAt')}T12:00:00`).toISOString();}
    if(action==='link_document')input.documentId=f.get('documentId');
    if(action==='create_support'){input.title=title;input.description=f.get('description');input.consent=f.get('consent')==='on';}
    void command(input,form);
  }
  if(!authReady)return <InlineSkeleton kind="journey"/>;
  if(!session)return <SignIn/>;
  if(!data)return <>{state?.owner===owner&&state?.error?<><p role="alert">{t('Recovery information could not be loaded. Please try again.')}</p><button className="save-control" onClick={()=>setRevision(v=>v+1)}>{t('Try again')}</button></>:<InlineSkeleton kind="journey"/>}</>;
  const hospital=data.hospitals.find(h=>h.id===journey?.hospital_id);
  const tasks=data.tasks.filter(task=>task.journey_id===journey?.id);
  const links=data.links.filter(l=>l.journey_id===journey?.id);
  function timelineTitle(event:Event){
    if(event.event_type==='stage_changed')return `${t('Current stage')}: ${t(stages.find(([value])=>`Stage: ${value.replaceAll('_',' ')}`===event.title)?.[1]??event.title.slice(7))}`;
    return event.event_type==='milestone'||event.event_type.startsWith('task_')?event.title:t(event.title);
  }
  return <><p className="personal-muted">{t('No reminders or clinical milestones are generated automatically.')}</p>{notice&&<p className="personal-notice" role="status">{t(notice)}</p>}
    {!journey&&<section className="recovery-start"><h2>{t('Start with one practical next step.')}</h2><p>{t('Your journey brings providers, documents, your own reminders and a timeline together. You choose what to keep and when to return.')}</p><ol className="recovery-timeline"><li>{t('Give your journey a name')}</li><li>{t('Add the provider or documents you want to keep')}</li><li>{t('Choose your next step')}</li></ol></section>}
    <section className="personal-panel"><details><summary>{t('Create recovery journey')}</summary><form className="personal-form" onSubmit={e=>submit(e,'create_journey')}><label>{t('Journey title')}<input name="title" required minLength={3} maxLength={120}/></label><label>{t('Published hospital (optional)')}<select name="hospitalId"><option value="">{t('No hospital selected')}</option>{data.hospitals.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label>{t('Existing care case (optional)')}<select name="caseId"><option value="">{t('No case selected')}</option>{data.cases.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><button className="button button--primary button--default" disabled={busy}>{t('Create recovery journey')}</button></form></details></section>
    {journey&&<><section className="recovery-overview" aria-label={t('Your journey at a glance')}><div><span>{t('Current stage')}</span><strong>{t(stages.find(([key])=>key===journey.stage)?.[1]??journey.stage)}</strong></div><div><span>{t('Next task')}</span><strong>{tasks.find(task=>task.status!=='completed')?.title??t('No coordination tasks yet.')}</strong></div><div><span>{t('Provider connection')}</span><strong>{hospital?.name??t('No hospital selected')}</strong></div></section><label className="sr-only" htmlFor="recovery-journey-select">{t('Recovery journey')}</label><select id="recovery-journey-select" className="recovery-switch" value={journey.id} onChange={e=>setSelected(e.target.value)}>{data.journeys.map(j=><option value={j.id} key={j.id}>{j.title}</option>)}</select>
      <div className="recover-grid"><div><section className="personal-panel"><h2>{journey.title}</h2><label className="personal-form">{t('Current stage')}<select aria-label={t('Current stage')} value={journey.stage} disabled={busy} onChange={e=>void command({action:'update_journey',journeyId:journey.id,stage:e.target.value})}>{stages.map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}</select></label>
        <h3>{t('Provider connection')}</h3>{hospital?<Link href={`/hospitals/${hospital.slug}`}>{hospital.name}</Link>:<p>{t(journey.hospital_id?'Provider listing no longer available':'No hospital selected')}</p>}<p className="personal-muted">{t('A saved connection does not mean the provider is monitoring you or that an appointment is confirmed.')}</p>
        <Link className="text-link" href="/assistant?q=Show%20my%20upcoming%20recovery%20tasks">{t('Show my upcoming recovery tasks')} →</Link>
      </section><section className="personal-panel"><h2>{t('Tasks')}</h2><p className="personal-muted">{t('Reminders are shown here and in your account. No email, SMS or appointment booking is performed.')}</p>
        <ul className="personal-list">{tasks.map(task=><li key={task.id} data-task-status={task.status}><div><strong>{task.title}</strong>{task.support_case_id&&<Link className="text-link" href={`/account?section=requests&request=${task.support_case_id}`}>Open linked request</Link>}<small>{t(task.status==='completed'?'Completed':'Upcoming')} · {t('User-created coordination task')}</small>{task.due_at&&<small><LocalDate value={task.due_at}/></small>}{task.completed_at&&<small>{t('Completed')} <LocalDate value={task.completed_at}/></small>}</div><button disabled={busy} aria-pressed={task.status==='completed'} className="save-control" onClick={()=>void command({action:'complete_task',journeyId:journey.id,taskId:task.id,completed:task.status!=='completed'})}>{t(task.status==='completed'?'Reopen':'Complete')}</button></li>)}</ul>{!tasks.length&&<p>{t('No coordination tasks yet.')}</p>}
        <form className="personal-form" onSubmit={e=>submit(e,'add_task')}><label>{t('Task title')}<input name="title" required minLength={3} maxLength={160}/></label><label>{t('Due date (optional)')}<input type="datetime-local" name="dueAt"/></label><button className="button button--primary button--default" disabled={busy}>{t('Add task')}</button></form>
      </section><section className="personal-panel"><h2>{t('Documents')}</h2><ul className="personal-list">{data.documents.filter(d=>d.journey_id===journey.id).map(d=><li key={d.document_id}>{data.files.find(f=>f.id===d.document_id)?.title??t('Document unavailable')}</li>)}</ul>
        {data.files.length>0&&<form className="personal-form" onSubmit={e=>submit(e,'link_document')}><label>{t('Choose a document')}<select name="documentId" required>{data.files.map(f=><option value={f.id} key={f.id}>{f.title}</option>)}</select></label><button disabled={busy} className="save-control">{t('Link existing document')}</button></form>}
        <Link className="text-link" href="/assistant?q=Organize%20my%20documents">{t('Upload securely in MedBridge AI')} →</Link>
      </section></div><div><section className="personal-panel"><h2>{t('Timeline')}</h2><ol className="recovery-timeline">{data.events.filter(event=>event.journey_id===journey.id).map(event=><li key={event.id}><strong>{timelineTitle(event)}</strong><small>{t(event.event_type.replaceAll('_',' '))} · <LocalDate value={event.occurred_at}/></small></li>)}</ol>
        <details><summary>{t('Add milestone')}</summary><form className="personal-form" onSubmit={e=>submit(e,'add_event')}><label>{t('Milestone title')}<input name="title" required minLength={3} maxLength={160}/></label><label>{t('Date')}<input name="occurredAt" type="date" required/></label><button disabled={busy} className="save-control">{t('Add milestone')}</button></form></details>
      </section><section className="personal-panel"><h2>{t('Contact support')}</h2><ul className="personal-list">{data.support.filter(s=>links.some(l=>l.support_case_id===s.id)).map(s=><li key={s.id}><Link href="/help">{s.title}</Link><span>{t(s.status.replaceAll('_',' '))}</span></li>)}</ul>
        <form className="personal-form" onSubmit={e=>submit(e,'create_support')}><label>{t('Request title')}<input name="title" minLength={3} maxLength={120} required/></label><label>{t('Describe the coordination help you need')}<textarea name="description" minLength={5} maxLength={4000} required rows={4}/></label><label className="check-label"><input type="checkbox" required name="consent"/>{t('I consent to share this written request with MedBridge Support. My journey and documents are not shared.')}</label><button className="button button--primary button--default" disabled={busy}>{t('Create support request')}</button></form><Link className="text-link" href="/help">{t('Open Patient Help')} →</Link>
      </section></div></div></>}
  </>;
}
