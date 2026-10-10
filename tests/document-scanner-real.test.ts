import {it,expect} from 'vitest';
import {scanBytes} from '../scripts/document-scanner/engine.mjs';
// Genuine engine only; no patient data. Official harmless antivirus test pattern.
it.skipIf(!process.env.MEDBRIDGE_REAL_CLAMAV_TEST)('real local ClamAV: harmless PDF clean and EICAR detected',async()=>{
 const clean=await scanBytes(Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'));
 expect(clean).toMatchObject({state:'clean',engine:'ClamAV'});
 const eicar=['X5O!P%@AP[4','\\PZX54(P^)7CC)7}$','EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
 const blocked=await scanBytes(Buffer.from(eicar));expect(blocked.state).toBe('quarantined');
},180000);
