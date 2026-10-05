import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { AgentError } from '@/lib/agents/errors';
import {getPublicSupabaseClient} from '@/lib/supabase/server';
export async function recoveryContext(db:SupabaseClient<Database>,userId:string) {
  const [journeys,tasks,events,saves,ownedCases]=await Promise.all([
    db.from('recovery_journeys').select('id,title,stage,hospital_id').eq('owner_id',userId).neq('stage','archived').limit(20),
    db.from('recovery_tasks').select('id,journey_id,title,status,due_at,source,completed_at').eq('owner_id',userId).order('due_at',{ascending:true,nullsFirst:false}).limit(50),
    db.from('recovery_events').select('journey_id,title,event_type,occurred_at').eq('owner_id',userId).order('occurred_at',{ascending:false}).limit(20),
    db.from('saved_items').select('kind,hospital_id,doctor_id').eq('owner_id',userId).neq('kind','package').limit(50),
    db.from('cases').select('id').eq('owner_id',userId).limit(50),
  ]);
  if([journeys,tasks,events,saves,ownedCases].some(r=>r.error))throw new AgentError('DATABASE_FAILURE','Recovery coordination is temporarily unavailable.');
  // Explicit owner request permits metadata only. No file contents, paths, contacts, staff notes or unrelated patient data.
  const ids=(ownedCases.data??[]).map(c=>c.id);
  const files=ids.length?await db.from('case_documents').select('id,title,document_type').in('case_id',ids).neq('status','archived').limit(50):{data:[],error:null};
  if(files.error)throw new AgentError('DATABASE_FAILURE','Document information is temporarily unavailable.');
  const publicDb=getPublicSupabaseClient(),saved=saves.data??[],hospitalIds=saved.flatMap(s=>s.hospital_id?[s.hospital_id]:[]),doctorIds=saved.flatMap(s=>s.doctor_id?[s.doctor_id]:[]);
  const [hospitals,doctors]=await Promise.all([
    hospitalIds.length?publicDb.from('hospitals').select('id,name,slug').in('id',hospitalIds):Promise.resolve({data:[],error:null}),
    doctorIds.length?publicDb.from('doctors').select('id,name,slug').in('id',doctorIds):Promise.resolve({data:[],error:null}),
  ]);
  if(hospitals.error||doctors.error)throw new AgentError('DATABASE_FAILURE','Saved provider information is temporarily unavailable.');
  const providers=new Map<string,{name:string;href:string}>([...(hospitals.data??[]).map(h=>[h.id,{name:h.name,href:`/hospitals/${h.slug}`}] as const),...(doctors.data??[]).map(d=>[d.id,{name:d.name,href:`/doctors/${d.slug}`}] as const)]);
  const activeIds=new Set((journeys.data??[]).map(j=>j.id));
  return {scope:'owner_non_clinical_coordination',journeys:journeys.data??[],tasks:(tasks.data??[]).filter(task=>activeIds.has(task.journey_id)),events:(events.data??[]).filter(event=>activeIds.has(event.journey_id)),savedProviders:saved.map(s=>({...s,...providers.get((s.hospital_id??s.doctor_id)!)})),documents:files.data??[],
    boundary:'User-created coordination only. No diagnosis, treatment advice, monitoring, booking, email or SMS. Use /recover for confirmed writes and /help for consented support.'};
}
