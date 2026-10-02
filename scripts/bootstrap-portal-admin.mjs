import { createClient } from '@supabase/supabase-js';

const email=process.argv[2];
if(!email||!email.includes('@')) throw new Error('Provide the explicitly authorized existing sign-in email.');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret=process.env.SUPABASE_SECRET_KEY;
if(!url||!secret) throw new Error('Load the ignored server environment before bootstrapping.');
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const {error}=await db.rpc('bootstrap_portal_super_admin',{p_email:email});
if(error) {
  if(error.message.includes('PORTAL_ALREADY_BOOTSTRAPPED')) {
    const {data,error:readError}=await db.from('staff_roles').select('user_id').eq('role','super_admin').eq('active',true);
    if(readError) throw new Error('Could not verify the existing bootstrap.');
    let matched=false;
    for(const row of data) {
      const user=await db.auth.admin.getUserById(row.user_id);
      matched ||= user.data.user?.email?.toLowerCase()===email.toLowerCase();
    }
    if(!matched) throw new Error('Bootstrap already exists for a different account; review staff roles.');
    console.log('The authorized account already has the active Super Admin role.');
  } else throw new Error(error.message.includes('PORTAL_USER_NOT_FOUND')?'The nominated email must sign in to MedBridge first.':'Admin bootstrap failed; check the database migration and server configuration.');
} else console.log('Initial Super Admin assigned to the explicitly authorized existing account.');
