import {it,expect,vi,describe} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {NextRequest} from 'next/server';
import {createServer} from 'node:net';
import {spawnSync} from 'node:child_process';
vi.mock('server-only',()=>({}));
import {scanResult} from '@/lib/documents/scanner-protocol';
import {scannedDownload,registerScan} from '@/lib/documents/security';
import {GET,POST} from '@/app/api/internal/document-scans/route';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from '@/types/database';
// The actual ClamAV engine integration is a separate explicit local test.
import {parseVerdict,parseStreamVerdict,scanBytes,scanStream} from '../scripts/document-scanner/engine.mjs';
const bytes=Buffer.from('%PDF-1.7\nQA harmless fixture\n%%EOF'),checksum=createHash('sha256').update(bytes).digest('hex');
it.each(['malformed-private-qa-marker','https://example.invalid/?private-qa-marker'])('redacts rejected scanner startup configuration %s',origin=>{
 const result=spawnSync(process.execPath,['scripts/document-scanner/worker.mjs','--once'],{encoding:'utf8',env:{...process.env,MEDBRIDGE_SCANNER_ORIGIN:origin}});
 expect(result.status).toBe(1);
 expect(result.stderr).toMatch(/Scanner configuration unavailable|Use a bare approved origin/);
 expect(result.stderr).not.toContain('private-qa-marker');
 expect(result.stdout).toBe('');
});
function db(clean=true,content=bytes){const download=vi.fn(async()=>({data:new Blob([content]),error:null}));const rpc=vi.fn(async()=>({data:clean?{checksum,size:bytes.length,mime:'application/pdf'}:null,error:clean?null:{code:'DOCUMENT_SECURITY_BLOCKED'}}));return {client:{rpc,storage:{from:()=>({download})}} as unknown as SupabaseClient<Database>,download,rpc};}
describe('authoritative file boundary',()=>{
 it.each(['pending_scan','scanning','quarantined','scan_failed','missing'])('blocks %s before downloading any bytes',async()=>{const d=db(false);await expect(scannedDownload(d.client,'care-documents','opaque')).rejects.toMatchObject({code:'DOCUMENT_SECURITY_BLOCKED'});expect(d.download).not.toHaveBeenCalled();});
 it('permits an authenticated proxy after a clean proof and exact checksum',async()=>{const d=db();expect(Buffer.from(await scannedDownload(d.client,'care-documents','opaque'))).toEqual(bytes);expect(d.rpc).toHaveBeenCalledTimes(2);});
 it('rejects altered bytes despite a prior clean verdict',async()=>{const d=db(true,Buffer.from('%PDF-1.7\nchanged'));await expect(scannedDownload(d.client,'care-documents','opaque')).rejects.toMatchObject({code:'DOCUMENT_SECURITY_BLOCKED'});});
 it('blocks retirement during buffered delivery',async()=>{const d=db();d.rpc.mockResolvedValueOnce({data:{checksum,size:bytes.length,mime:'application/pdf'},error:null}).mockResolvedValueOnce({data:null,error:{code:'DOCUMENT_SECURITY_BLOCKED'}});await expect(scannedDownload(d.client,'care-documents','opaque')).rejects.toThrow();});
 it('rejects file spoofing before registration',async()=>{const d=db();await expect(registerScan(d.client,'care-documents','opaque',Buffer.from('not a PDF'),'application/pdf','a.pdf')).rejects.toThrow();expect(d.rpc).not.toHaveBeenCalled();});
});
describe('strict scanner reports',()=>{
 const version=`ClamAV 1.4.6/12345/${new Date().toUTCString()}`,summary='Known viruses: 100\nScanned files: 1\nInfected files: 0\n';
 it('parses a consistent clean engine exit',()=>expect(parseVerdict(0,summary,version).state).toBe('clean'));
 it('quarantines a consistent detected engine exit',()=>expect(parseVerdict(1,summary.replace('files: 0','files: 1'),version).state).toBe('quarantined'));
 it.each([[2,summary],[0,''],[0,summary+'ERROR: scan skipped'],[0,summary+'Heuristics.Limits.Exceeded'],[0,summary.replace('Scanned files: 1','Scanned files: 0')],[0,summary.replace('Infected files: 0','Infected files: 1')]])('blocks inconclusive engine result %s', (exit,output)=>expect(parseVerdict(exit,output,version).state).toBe('scan_failed'));
 it('blocks stale signatures',()=>expect(parseVerdict(0,summary,'ClamAV 1.4.6/12345/Mon Jan 01 2024')).toMatchObject({state:'scan_failed'}));
 it('blocks missing engine service',async()=>{const before={port:process.env.CLAMD_PORT,socket:process.env.CLAMD_SOCKET};delete process.env.CLAMD_PORT;delete process.env.CLAMD_SOCKET;try{expect(await scanBytes(bytes,{binary:'medbridge-nonexistent-scanner'})).toMatchObject({state:'scan_failed',category:'unavailable'});}finally{if(before.port!==undefined)process.env.CLAMD_PORT=before.port;if(before.socket!==undefined)process.env.CLAMD_SOCKET=before.socket;}});
 it.each(['stream: UNKNOWN','stream: OK\nignored','stream: Heuristics.Limits.Exceeded FOUND','stream: Heuristics.Encrypted.PDF FOUND'])('never accepts unsupported stream report %s',output=>expect(parseStreamVerdict(output,version).state).toBe('scan_failed'));
 it('does not accept an empty signature database',()=>expect(parseStreamVerdict('stream: OK',version.replace('/12345/','/0/')).state).toBe('scan_failed'));
 it('rejects malformed reports, unknown states and sensitive extra fields',()=>{for(const input of [{state:'clean',checksum},{state:'safe',checksum},{state:'scan_failed',checksum,category:'timeout',filename:'PRIVATE',url:'SECRET'}])expect(scanResult.safeParse(input).success).toBe(false);});
});
// These TCP doubles exercise error contracts, not malware detection evidence.
it.each(['timeout','malformed'] as const)('blocks a %s scanner transport',async(category)=>{
 const before={port:process.env.CLAMD_PORT,socket:process.env.CLAMD_SOCKET};
 const sockets=new Set<import('node:net').Socket>();
 const server=createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.resume();if(category==='malformed')socket.once('data',()=>socket.end('unsupported response'));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('test server');
 process.env.CLAMD_PORT=String(address.port);delete process.env.CLAMD_SOCKET;
 // Allow the malformed-response fixture to answer under load; only the silent fixture tests the short timeout.
 try{expect(await scanStream(bytes,category==='timeout'?50:2000)).toMatchObject({state:'scan_failed',category});}
 finally{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));if(before.port===undefined)delete process.env.CLAMD_PORT;else process.env.CLAMD_PORT=before.port;if(before.socket!==undefined)process.env.CLAMD_SOCKET=before.socket;}
});
it('does not allow ordinary sessions to read a scan payload or submit a verdict',async()=>{
 const before=process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED;delete process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED;
 try{const id=randomUUID(),lease=randomUUID();const read=await GET(new NextRequest(`http://localhost/api/internal/document-scans?id=${id}&lease=${lease}`,{headers:{Authorization:'Bearer ordinary-session'}}));expect(read.status).toBe(401);const write=await POST(new NextRequest('http://localhost/api/internal/document-scans',{method:'POST',body:JSON.stringify({action:'result',id,lease,result:{state:'clean'}})}));expect(write.status).toBe(401);expect(await write.text()).not.toMatch(/checksum|path|stack|token/);}finally{if(before===undefined)delete process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED;else process.env.MEDBRIDGE_DOCUMENT_SCANNER_ENABLED=before;}
});
