import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
try {
 const {translate}=await server.ssrLoadModule('/lib/experience/messages.ts');
 const catalogue=JSON.parse(readFileSync('lib/experience/interface-catalogue.json','utf8'));
 const invariants=new Set(['MEDBRIDGE','MedBridge','MedBridge AI','MedBridge /','PDF','PNG','JPG','USD','INR','application/pdf','image/png','you@organization.com']);
 const missing=catalogue.filter(text=>!invariants.has(text)&&/[A-Za-z]/.test(text)&&translate(text,'hi')===text);
 writeFileSync(join(tmpdir(),'medbridge-missing-locales.json'),JSON.stringify(missing,null,2));
 console.log(`${missing.length}/${catalogue.length} untranslated interface messages.`);
 console.log(JSON.stringify(missing.slice(0,160),null,2));
}finally{await server.close();}
