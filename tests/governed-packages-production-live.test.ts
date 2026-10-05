import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
vi.mock('server-only', () => ({}));
import { orchestrate } from '@/lib/agents/orchestrator';
import { configuredProvider } from '@/lib/agents/cloudflare-provider';
import { createAdminClient, createUserClient, SupabaseAgentStore, SupabaseCaseAccess } from '@/lib/agents/persistence';
import { SupabasePlanningStore } from '@/lib/agents/treatment-planning/store';

// Deliberately separate from the isolated synthetic fixture gates: this uses
// ordinary public production RLS, existing real packages and a disposable patient.
it.skipIf(process.env.RUN_GOVERNED_PRODUCTION_LIVE !== '1')('executes published health check discovery with actual hosted persistence', async () => {
  const admin=createAdminClient(),email=`medbridge-package-runtime-${randomUUID()}@example.invalid`,password=randomUUID();
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();
  const userId=created.data.user!.id;
  try {
    const anon=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const login=await anon.auth.signInWithPassword({email,password});expect(login.error).toBeNull();
    const db=createUserClient(login.data.session!.access_token);
    const context={userId,store:new SupabaseAgentStore(admin,db),planningStore:new SupabasePlanningStore(admin,db),caseAccess:new SupabaseCaseAccess(db),provider:configuredProvider()};
    const result=await orchestrate({content:'Show me Health Checkup packages in Mumbai.'},{userId,store:new SupabaseAgentStore(admin,db),planningStore:new SupabasePlanningStore(admin,db),caseAccess:new SupabaseCaseAccess(db),provider:configuredProvider()});
    expect(result.status).toBe('completed');
    expect(result.findings.filter(f=>f.kind==='packages').map(f=>f.title)).toEqual(expect.arrayContaining(['Platinum (Male)','Whole Body Check Male - III']));
    expect(result.findings.every(f=>f.provenance.sourceKind==='external')).toBe(true);
    const unsupported=await orchestrate({content:'Show me Hip Replacement packages in Mumbai.'},{userId,store:new SupabaseAgentStore(admin,db),planningStore:new SupabasePlanningStore(admin,db),caseAccess:new SupabaseCaseAccess(db),provider:configuredProvider()});
    expect(unsupported.findings.every(f=>f.provenance.sourceKind==='external')).toBe(true);
    const hospital=await orchestrate({content:'Find knee replacement hospitals in Mumbai.'},context);
    for(const content of ['Tell me more about the first one.','Show me its packages.','Tell me more about the second package.','Compare the hospitals.','Which package includes accommodation?','What information is missing?']) {
      const response=await orchestrate({content,conversationId:hospital.conversationId},context);
      expect(response.status).not.toBe('failed');
      if(content==='What information is missing?') {
        expect(response.patientCase).toBeUndefined();
        expect(response.summary).toMatch(/missing|not (?:provided|published|confirmed)|no published/i);
      }
    }
  } finally {expect((await admin.auth.admin.updateUserById(userId,{ban_duration:'876000h'})).error).toBeNull();}
},360000);
