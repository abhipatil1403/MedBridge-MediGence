/** Harmless EICAR antivirus pattern in a real PDF embedded-file stream. In-memory only. */
export function antivirusTestPdf(){
 const pattern=['X5O!P%@AP[4','\\PZX54(P^)7CC)7}$','EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
 const objects=[
  '<< /Type /Catalog /Pages 4 0 R /Names << /EmbeddedFiles << /Names [(fixture.txt) 2 0 R] >> >> >>',
  '<< /Type /Filespec /F (fixture.txt) /EF << /F 3 0 R >> >>',
  `<< /Type /EmbeddedFile /Length ${pattern.length} >>\nstream\n${pattern}\nendstream`,
  '<< /Type /Pages /Count 0 /Kids [] >>',
 ];let pdf='%PDF-1.7\n';const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(pdf);
}
