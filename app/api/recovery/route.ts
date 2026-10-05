import { NextRequest } from 'next/server';
import { experienceSession,experienceFailure } from '@/lib/experience/server';
import { recoveryCommandSchema } from '@/lib/experience/preferences';
import { checked, portalResponse } from '@/lib/portals/server';
import { getPublicSupabaseClient } from '@/lib/supabase/server';
export async function GET(request:NextRequest) {
  try {
    const {user,db}=await experienceSession(request);
    const journeys=checked(await db.from('recovery_journeys').select('*').eq('owner_id',user.id).order('updated_at',{ascending:false}).limit(50));
    const [tasks,events,documents,links,caseRows,hospitals]=await Promise.all([
      db.from('recovery_tasks').select('*').eq('owner_id',user.id).order('due_at',{ascending:true,nullsFirst:false}).limit(500),
      db.from('recovery_events').select('*').eq('owner_id',user.id).order('occurred_at',{ascending:false}).limit(500),
      db.from('recovery_documents').select('*').eq('owner_id',user.id).limit(200),
      db.from('recovery_support_links').select('*').eq('owner_id',user.id).limit(200),
      db.from('cases').select('id,title').eq('owner_id',user.id).limit(50),
      getPublicSupabaseClient().from('hospitals').select('id,name,slug').order('name').limit(200),
    ]);
    const ownedCases=checked(caseRows);
    const files=ownedCases.length?checked(await db.from('case_documents').select('id,title,document_type,status').in('case_id',ownedCases.map(c=>c.id)).neq('status','archived').limit(200)):[];
    const supportIds=checked(links).map(l=>l.support_case_id);
    const support=supportIds.length?checked(await db.from('support_cases').select('id,title,status').in('id',supportIds).eq('patient_id',user.id)):[];
    return portalResponse({journeys,tasks:checked(tasks),events:checked(events),documents:checked(documents),links:checked(links),files,hospitals:checked(hospitals),support,cases:ownedCases});
  }catch(error){return experienceFailure(error);}
}
export async function POST(request:NextRequest) {
  try {
    const {db}=await experienceSession(request);
    const parsed=recoveryCommandSchema.parse(await request.json());
    const {action,...input}=parsed;
    return portalResponse(checked(await db.rpc('experience_command',{p_action:action,p_input:input})));
  }catch(error){return experienceFailure(error);}
}
