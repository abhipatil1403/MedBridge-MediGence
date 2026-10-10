import {it,expect,vi,beforeEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
vi.mock('server-only',()=>({}));
const h=vi.hoisted(()=>({role:'super_admin',portal:'admin',signedIn:true,db:undefined as unknown,admin:vi.fn()}));
vi.mock('@/lib/portals/server',async(importOriginal)=>{const real=await importOriginal<typeof import('@/lib/portals/server')>();return {...real,portalSession:async()=>{if(!h.signedIn)throw new real.PortalError(401,'Sign in to continue.');return {portal:h.portal,context:{role:h.role},db:h.db};}};});
vi.mock('@/lib/agents/persistence',()=>({createAdminClient:()=>h.admin()}));
import {GET,POST} from '@/app/api/portals/document-cleanup/route';
const id=randomUUID(),lease=randomUUID();
beforeEach(()=>{h.role='super_admin';h.portal='admin';h.signedIn=true;h.admin.mockReset();});
function request(input:unknown={id,confirmed:true}){return new NextRequest('http://localhost/api/portals/document-cleanup?portal=admin',{method:'POST',body:JSON.stringify(input)});}
it.each(['patient','support_agent','admin','provider_admin'])('denies recovery by %s before using service access',async(role)=>{h.role=role;expect((await POST(request())).status).toBe(403);expect(h.admin).not.toHaveBeenCalled();});
it('requires a verified session',async()=>{h.signedIn=false;expect((await POST(request())).status).toBe(401);expect(h.admin).not.toHaveBeenCalled();});
it.each([{id,confirmed:false},{id,confirmed:true,path:'OTHER'},{id:'invalid',confirmed:true}])('requires exact explicit confirmation %s',async(input)=>{expect((await POST(request(input))).status).toBe(400);expect(h.admin).not.toHaveBeenCalled();});
it('returns failure and safe actionable text when bytes remain',async()=>{
 const rpc=vi.fn(async(name:string)=>({data:name==='document_deletion_claim'?{id,lease,bucket:'care-documents',path:'PRIVATE'}:{id,state:'cleanup_failed'},error:null}));
 h.admin.mockReturnValue({rpc,storage:{from:()=>({remove:async()=>({error:null}),info:async()=>({data:{name:'PRIVATE'},error:null})})}});
 const r=await POST(request());expect(r.status).toBe(409);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.text()).toContain('unconfirmed');
});
it('returns categorical persisted completion without exposing a storage identity or lease',async()=>{h.admin.mockReturnValue({rpc:async()=>({data:{id,state:'deleted'},error:null})});const r=await POST(request());expect(r.status).toBe(200);expect(await r.json()).toEqual({id,state:'deleted'});});
it('returns private no-store queue data for a Super Admin',async()=>{h.db={rpc:async()=>({data:[{id,state:'held',attempts:0}],error:null})};const r=await GET(new NextRequest('http://localhost/api/portals/document-cleanup?portal=admin'));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');});
