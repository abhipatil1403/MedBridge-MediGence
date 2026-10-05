import fs from 'node:fs/promises';
const origin=process.env.MEDBRIDGE_TEST_ORIGIN??'https://medbridge-medigence.vercel.app';
const inventory=await (await fetch(new URL('/api/discover',origin),{signal:AbortSignal.timeout(90000)})).json();
const paths=['/','/discover','/doctors','/hospitals','/treatments','/packages','/compare','/account','/recover','/assistant','/help'];
for(const kind of ['doctors','hospitals','packages','treatments']){const item=inventory.sections[kind]?.[0]?.item;if(item)paths.push(`/${kind}/${item.slug}`);}
const measurements=[];
for(const path of paths){
  const start=performance.now();
  const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(90000),headers:{'Cache-Control':'no-cache'}});
  const headersMs=performance.now()-start;
  let html='',shellMs,contentMs;
  const reader=response.body.getReader();const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;html+=decoder.decode(value,{stream:true});
    if(shellMs===undefined&&html.includes('site-header'))shellMs=performance.now()-start;
    if(contentMs===undefined&&(html.includes('class="directory-intro"')||html.includes('class="profile-hero')||html.includes('class="hero')||html.includes('class="assistant-page')||html.includes('class="comparison-page')||html.includes('class="discover-page')||html.includes('class="account-page')||html.includes('class="recover-page')||html.includes('class="help-page')||html.includes('data-page-content')))contentMs=performance.now()-start;
  }
  const row={path,status:response.status,headersMs:Math.round(headersMs),shellMs:Math.round(shellMs??headersMs),primaryMs:contentMs===undefined?null:Math.round(contentMs),completeMs:Math.round(performance.now()-start),serverTiming:response.headers.get('server-timing'),bytes:Buffer.byteLength(html),genericLoading:/Loading (?:your page|care options)/.test(html)};
  measurements.push(row);console.log(JSON.stringify(row));
}
if(process.env.MEDBRIDGE_TIMING_OUTPUT)await fs.writeFile(process.env.MEDBRIDGE_TIMING_OUTPUT,JSON.stringify({origin,measuredAt:new Date().toISOString(),measurements},null,2));
