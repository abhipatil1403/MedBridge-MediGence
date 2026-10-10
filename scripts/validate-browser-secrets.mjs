import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';

// Values stay in this process. Report paths only, never secret contents.
const secrets=Object.entries(process.env).filter(([key,value])=>!key.startsWith('NEXT_PUBLIC_')&&/(API_KEY|API_TOKEN|SECRET_KEY|SERVICE_ROLE_KEY|DOCUMENT_SCANNER_TOKEN)$/.test(key)&&value?.length>=16);
assert.ok(secrets.length>0,'Load the ignored local environment to audit configured secrets.');
const sources=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(path=>path&&existsSync(path));
const browser=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(path.endsWith('.js'))browser.push(path);}}
walk('.next/static');
assert.ok(browser.length>0,'Build must finish before auditing browser JavaScript.');
const failures=[];
for(const path of [...sources,...browser]){
 const content=readFileSync(path,'utf8');
 if(secrets.some(([,value])=>content.includes(value)))failures.push(path);
}
assert.deepEqual(failures,[],'A configured private secret appears in source or browser assets.');
console.log(`PASS: configured private secrets absent from ${sources.length} repository files and ${browser.length} browser JavaScript assets.`);
