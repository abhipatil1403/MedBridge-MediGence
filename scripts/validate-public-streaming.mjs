import assert from 'node:assert/strict';

// Exercises the running production build, including its actual streamed HTML.
// No database credentials, browser automation or synthetic public records.
const origin=process.env.MEDBRIDGE_TEST_ORIGIN??'http://127.0.0.1:3000';
const inventory=await (await fetch(new URL('/api/discover',origin))).json();
const routes=['/','/discover','/doctors','/hospitals','/treatments','/packages','/compare','/assistant','/account','/recover','/help'];
for(const kind of ['doctors','hospitals','packages','treatments']){
  const record=inventory.sections[kind]?.[0]?.item;
  assert.ok(record,`${kind}: published detail required for this release gate`);
  routes.push(`/${kind}/${record.slug}`);
}
for(const path of routes){
  const started=performance.now();
  const response=await fetch(new URL(path,origin),{signal:AbortSignal.timeout(60000)});
  assert.equal(response.status,200,path);
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let html='',shellAt;
  while(true){const chunk=await reader.read();if(chunk.done)break;html+=decoder.decode(chunk.value,{stream:true});if(shellAt===undefined&&html.includes('site-header'))shellAt=performance.now()-started;}
  assert.ok(shellAt!==undefined,`${path}: streamed global shell`);
  assert.ok(!/Loading (?:your page|care options)/.test(html),`${path}: no generic loading screen`);
  assert.ok(html.includes('id="main-content"'),`${path}: accessible main region`);
  if(/^\/(doctors|hospitals|packages|treatments)\//.test(path)){
    assert.ok(html.includes('data-route-loading'),`${path}: profile skeleton in initial stream`);
    assert.ok(html.indexOf('data-route-loading')<html.indexOf('data-page-content'),`${path}: structure precedes primary catalog data`);
  }
  if(/^\/(doctors|hospitals|packages)\//.test(path)){
    assert.ok(html.includes('data-secondary-loading'),`${path}: secondary information has its own streaming boundary`);
  }
  console.log(JSON.stringify({path,shellMs:Math.round(shellAt),completeMs:Math.round(performance.now()-started),passed:true}));
}
console.log(`PASS ${routes.length} public streaming routes`);
