import {it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
const {search}=vi.hoisted(()=>({search:vi.fn()}));
vi.mock('@/lib/discovery/search-service',()=>({searchService:{search}}));
import {GET} from '@/app/api/discover/route';
it('does not log raw downstream diagnostics, document details or bearer URLs',async()=>{
  search.mockRejectedValue({code:'TIMEOUT',message:'QA_PRIVATE_DOCUMENT_NAME',stack:'QA_RAW_STACK',signedUrl:'https://qa.invalid/private?token=QA_TOKEN'});
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try {
    const response=await GET(new NextRequest('http://localhost/api/discover?q=health'));
    expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'Search is temporarily unavailable. Please retry.'});
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/QA_PRIVATE|QA_RAW|QA_TOKEN|signedUrl|stack/);
    expect(log).toHaveBeenCalledWith('{"event":"catalog_read_failed","category":"timeout"}');
  } finally {log.mockRestore();}
});
