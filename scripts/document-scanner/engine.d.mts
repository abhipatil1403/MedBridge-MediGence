export type Verdict={state:'clean'|'quarantined';engine:'ClamAV';engineVersion:string;signatureVersion:string;signatureAt:string;policyVersion:'clamav-v1'}|{state:'scan_failed';category:'timeout'|'unavailable'|'malformed'|'inconclusive'|'integrity'|'invalid_file'};
export function parseVerdict(code:number,stdout:string,version:string,now?:number):Verdict;
export function parseStreamVerdict(output:string,version:string,now?:number):Verdict;
export function scanStream(bytes:Uint8Array,timeout?:number):Promise<Verdict&{checksum:string}>;
export function scanBytes(bytes:Uint8Array,options?:{binary?:string;database?:string;timeout?:number}):Promise<Verdict&{checksum:string}>;
