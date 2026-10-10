import {z} from 'zod';
export const scanCategories=['timeout','unavailable','malformed','inconclusive','integrity','invalid_file'] as const;
const common={checksum:z.string().regex(/^[a-f0-9]{64}$/)};
const engine={engine:z.literal('ClamAV'),engineVersion:z.string().regex(/^1\.\d+\.\d+$/),signatureVersion:z.string().regex(/^\d{1,12}$/),signatureAt:z.iso.datetime(),policyVersion:z.literal('clamav-v1')};
export const scanResult=z.discriminatedUnion('state',[
 z.object({...common,...engine,state:z.literal('clean')}).strict(),
 z.object({...common,...engine,state:z.literal('quarantined')}).strict(),
 z.object({...common,state:z.literal('scan_failed'),category:z.enum(scanCategories)}).strict(),
]);
export const scanJob=z.object({id:z.uuid(),bucket:z.enum(['care-documents','provider-documents']),object_path:z.string().max(500),checksum:common.checksum,size_bytes:z.number().int().positive().max(3145728),mime_type:z.enum(['application/pdf','image/png','image/jpeg']),state:z.enum(['pending_scan','scanning','clean','quarantined','scan_failed']),lease:z.uuid(),lease_until:z.string().nullable()});
