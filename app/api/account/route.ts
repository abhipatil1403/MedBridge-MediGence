import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { experienceSession,experienceFailure } from '@/lib/experience/server';
import { preferenceSchema, profileSchema, savedItemSchema } from '@/lib/experience/preferences';
import { checked, portalResponse } from '@/lib/portals/server';
import { getPublicSupabaseClient } from '@/lib/supabase/server';
export async function GET(request: NextRequest) {
  try {
    const { user, db } = await experienceSession(request);
    const section = request.nextUrl.searchParams.get('section') ?? 'profile';
    if (section === 'profile') {
      const profile = checked(await db.from('profiles').select('display_name,locale,currency,phone,country,city,preferences_updated_at').eq('id', user.id).single());
      const prefs = checked(await db.from('portal_accounts').select('notification_preferences').eq('user_id',user.id));
      const account = prefs[0]?.notification_preferences as { in_app?: boolean } | undefined;
      return portalResponse({ profile, email: user.email, inApp: account?.in_app !== false });
    }
    if (section === 'saved') {
      const items=checked(await db.from('saved_items').select('*').eq('owner_id', user.id).order('created_at',{ascending:false}));
      const publicDb=getPublicSupabaseClient();
      const [h,d,p]=await Promise.all([items.some(i=>i.hospital_id)?publicDb.from('hospitals').select('id,name,slug').in('id',items.flatMap(i=>i.hospital_id?[i.hospital_id]:[])):Promise.resolve({data:[],error:null}),
        items.some(i=>i.doctor_id)?publicDb.from('doctors').select('id,name,slug').in('id',items.flatMap(i=>i.doctor_id?[i.doctor_id]:[])):Promise.resolve({data:[],error:null}),
        items.some(i=>i.package_id)?publicDb.from('packages').select('id,name,slug').in('id',items.flatMap(i=>i.package_id?[i.package_id]:[])):Promise.resolve({data:[],error:null})]);
      const records=new Map([...checked(h),...checked(d),...checked(p)].map(record=>[record.id,record]));
      return portalResponse({items:items.map(item=>({...item,record:records.get((item.hospital_id??item.doctor_id??item.package_id)!)??null}))});
    }
    if (section === 'searches') return portalResponse({ items: checked(await db.from('recent_searches').select('id,query,updated_at').eq('owner_id',user.id).order('updated_at',{ascending:false}).limit(20)) });
    if (section === 'conversations') return portalResponse({ items: checked(await db.from('conversations').select('id,title,updated_at').eq('owner_id',user.id).order('updated_at',{ascending:false}).limit(30)) });
    if (section === 'plans') return portalResponse({ items: checked(await db.from('care_plans').select('id,title,status,conversation_id,updated_at').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(30)) });
    if (section === 'notifications') return portalResponse({ items: checked(await db.from('portal_notifications').select('id,title,body,read_at,created_at,resource_type,resource_id').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50)) });
    return NextResponse.json({error:'Unknown account section.'},{status:400});
  } catch(error) { return experienceFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const { db } = await experienceSession(request);
    const input = z.object({ action: z.enum(['save_profile','save_preferences','save_item','save_search','read_notification','clear_searches']), input: z.unknown() }).strict().parse(await request.json());
    if (input.action === 'clear_searches') {
      checked(await db.rpc('experience_command',{p_action:'clear_searches',p_input:{}}));
      return portalResponse({});
    }
    if (input.action === 'read_notification') {
      const parsed=z.object({id:z.uuid()}).strict().parse(input.input);
      return portalResponse(checked(await db.rpc('portal_command',{p_action:'mark_notification',p_input:{notificationId:parsed.id}})));
    }
    const parsed = input.action === 'save_profile' ? profileSchema.parse(input.input) : input.action === 'save_preferences' ? preferenceSchema.parse(input.input)
      : input.action === 'save_item' ? savedItemSchema.parse(input.input) : z.object({query:z.string().trim().min(2).max(240)}).strict().parse(input.input);
    return portalResponse(checked(await db.rpc('experience_command',{p_action:input.action,p_input:parsed})));
  } catch(error) { return experienceFailure(error); }
}
