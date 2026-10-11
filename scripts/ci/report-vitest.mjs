/** Reports real Vitest results; known integration skips are never counted as passes. */
import {appendFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {relative} from 'node:path';
const [path,mode]=process.argv.slice(2);
if(!path||![undefined,'--isolated'].includes(mode))throw new Error('Usage: report-vitest.mjs <report.json> [--isolated]');
const report=JSON.parse(readFileSync(path,'utf8'));
const manifest=mode==='--isolated'?{files:[]}:JSON.parse(readFileSync(new URL('./expected-skips.json',import.meta.url),'utf8'));
const root=fileURLToPath(new URL('../../',import.meta.url));
const cases=report.testResults.flatMap(file=>file.assertionResults.map(test=>({
  file:relative(root,file.name).replaceAll('\\','/'),name:test.fullName,status:test.status,
})));
const skipped=cases.filter(t=>['pending','skipped','todo'].includes(t.status));
const passed=cases.filter(t=>t.status==='passed').length;
const failed=cases.filter(t=>t.status==='failed').length;
const expected=mode==='--isolated'?[]:manifest.files.flatMap(file=>file.tests.map(name=>({file:file.file,name,reason:file.reason})));
const key=t=>JSON.stringify([t.file,t.name]);
const expectedKeys=new Set(expected.map(key)),actualKeys=new Set(skipped.map(key));
const unexpected=skipped.filter(t=>!expectedKeys.has(key(t)));
const missing=expected.filter(t=>!actualKeys.has(key(t)));
const errors=[];
if(report.success!==true||report.numFailedTests>0||report.numFailedTestSuites>0||failed>0)errors.push('Vitest reported failures.');
if(!passed||!cases.length)errors.push('No completed regression tests.');
if(cases.length!==report.numTotalTests||passed!==report.numPassedTests||failed!==report.numFailedTests||skipped.length!==report.numPendingTests)errors.push('Incomplete or inconsistent Vitest report.');
if(cases.some(t=>!['passed','failed','pending','skipped','todo'].includes(t.status)))errors.push('Unknown test status.');
if(unexpected.length||missing.length||skipped.length!==expected.length)errors.push('Skip inventory changed; review explicit integration prerequisites before updating the manifest.');
if(mode==='--isolated'&&(passed!==3||new Set(cases.map(t=>t.file)).size!==2||cases.some(t=>!['tests/workflow-persistence-local.test.ts','tests/inquiry-safety-local.test.ts'].includes(t.file))))errors.push('Expected all three existing local workflow/inquiry tests.');
const lines=[`## ${mode?'Isolated persistence':'Regression'} results`,'',
  `Passed: **${passed}**. Failed: **${failed}**. Skipped (not passed): **${skipped.length}**.`,
  '',...skipped.map(t=>`- ${t.file}: ${t.name} — ${expected.find(e=>key(e)===key(t))?.reason??'UNEXPECTED SKIP'}`),
  ...missing.map(t=>`- Expected skip missing: ${t.file}: ${t.name}`),
  '',...(errors.length?errors.map(e=>`FAIL: ${e}`):['PASS: completed tests passed and skip inventory matched; external integration acceptance remains separate.'])];
console.log(lines.join('\n'));
if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join('\n')+'\n');
if(errors.length)process.exitCode=1;
