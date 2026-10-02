import { z } from 'zod';

export const portalSchema = z.enum(['provider', 'support', 'admin', 'patient']);
export type Portal = z.infer<typeof portalSchema>;
export const recordKinds = ['organization','location','specialty','treatment','doctor','facility','accreditation','package','international_service'] as const;
export type RecordKind = typeof recordKinds[number];
export type Field = { key: string; label: string; type?: 'text'|'textarea'|'email'|'url'|'number'|'date'|'list'|'select'|'checkbox'; options?: readonly string[]; catalog?: string; min?: number; help?: string };
export const fields: Record<RecordKind, Field[]> = {
  organization: [
    {key:'legalName',label:'Legal name'}, {key:'providerType',label:'Provider type',type:'select',options:['hospital','clinic','healthcare_organization']},
    {key:'description',label:'Overview',type:'textarea'}, {key:'yearEstablished',label:'Year established',type:'number',min:1800},
    {key:'website',label:'Official website',type:'url',help:'Use an HTTPS website you are authorized to represent.'},
    {key:'email',label:'Contact email',type:'email'}, {key:'phone',label:'Contact phone'}, {key:'contactName',label:'Contact person'},
    {key:'address',label:'Address',type:'textarea'}, {key:'cityId',label:'City / country',type:'select',catalog:'cities'}, {key:'state',label:'State'}, {key:'postalCode',label:'Postal code'},
  ],
  location: [{key:'address',label:'Address',type:'textarea'},{key:'cityId',label:'City / country',type:'select',catalog:'cities'},{key:'state',label:'State'},{key:'postalCode',label:'Postal code'},{key:'phone',label:'Phone'},{key:'services',label:'Services',type:'list'},{key:'facilities',label:'Facilities',type:'list'}],
  specialty: [{key:'specialtyId',label:'Canonical specialty',type:'select',catalog:'specialties'},{key:'department',label:'Department'},{key:'description',label:'Provider information',type:'textarea'}],
  treatment: [{key:'treatmentId',label:'Canonical treatment',type:'select',catalog:'treatments'},{key:'description',label:'Provider-specific information',type:'textarea'},{key:'eligibilityNote',label:'Eligibility / limitations',type:'textarea'}],
  doctor: [{key:'specialtyId',label:'Primary specialty',type:'select',catalog:'specialties'},{key:'department',label:'Department'},{key:'professionalTitle',label:'Professional title'},{key:'credentials',label:'Credentials',type:'textarea'},{key:'experienceYears',label:'Years of experience',type:'number',min:0},{key:'languages',label:'Languages',type:'list'},{key:'consultationMode',label:'Consultation mode',type:'select',options:['video','in-person','both']},{key:'biography',label:'Biography',type:'textarea'},{key:'locationIds',label:'Associated locations',type:'list',help:'Enter the location record IDs, one per line.'},{key:'treatmentIds',label:'Associated treatments',type:'list',help:'Enter canonical treatment IDs, one per line.'},{key:'imageDocumentId',label:'Profile image',type:'select',catalog:'provider_documents'}],
  facility: [{key:'facilityType',label:'Facility type',type:'select',options:['beds','icu','operating_theatres','diagnostics','pharmacy','rehabilitation','emergency','other']},{key:'quantity',label:'Quantity (if applicable)',type:'number',min:0},{key:'description',label:'Actual facilities / availability',type:'textarea'}],
  accreditation: [{key:'body',label:'Accreditation body'},{key:'certificateNumber',label:'Certificate number'},{key:'issuedOn',label:'Issue date',type:'date'},{key:'expiresOn',label:'Expiry date',type:'date'},{key:'documentId',label:'Supporting certificate',type:'select',catalog:'provider_documents'},{key:'sourceUrl',label:'Authoritative source',type:'url'}],
  package: [{key:'treatmentId',label:'Treatment',type:'select',catalog:'treatments'},{key:'description',label:'Description',type:'textarea'},{key:'price',label:'Estimated package price',type:'number',min:0},{key:'currency',label:'Currency',type:'select',options:['USD','INR','EUR','GBP','AED','THB','SGD','MYR','TRY']},{key:'durationDays',label:'Duration (days)',type:'number',min:1},{key:'inclusions',label:'Explicit inclusions',type:'list'},{key:'exclusions',label:'Explicit exclusions',type:'list'},{key:'validFrom',label:'Valid from',type:'date'},{key:'validUntil',label:'Valid until',type:'date'},{key:'terms',label:'Terms and limitations',type:'textarea'},{key:'documentIds',label:'Supporting document IDs',type:'list'}],
  international_service: [{key:'serviceType',label:'Service',type:'select',options:['international_patient_desk','airport_transfer','accommodation_assistance','interpreter','visa_assistance','travel_coordination','teleconsultation','other']},{key:'languages',label:'Languages',type:'list'},{key:'description',label:'Availability and limitations',type:'textarea'},{key:'included',label:'Included without an additional charge',type:'checkbox'}],
};
export const providerSections = [
  ['dashboard','Dashboard'],['onboarding','My organization'],['profile','Profile'],['locations','Locations'],['specialties','Departments & specialties'],['treatments','Treatments & procedures'],['doctors','Doctors'],['facilities','Facilities'],['accreditations','Accreditations'],['packages','Packages'],['pricing','Pricing'],['international','International services'],['documents','Documents'],['submissions','Submissions'],['verification','Verification'],['preview','Public preview'],['messages','Messages'],['notifications','Notifications'],['activity','Activity'],['team','Team members'],['settings','Settings'],
] as const;
export const supportSections = [['dashboard','Dashboard'],['cases','Cases'],['queue','My queue'],['all-cases','All cases'],['escalated','Escalated'],['users','Users'],['providers','Providers'],['documents','Documents'],['tasks','Tasks'],['messages','Messages'],['activity','Activity'],['notifications','Notifications'],['team','Team workload'],['settings','Settings']] as const;
export const adminSections = [['dashboard','Dashboard'],['users','Users & roles'],['providers','Providers'],['applications','Provider applications'],['submissions','Submissions'],['hospitals','Hospitals'],['doctors','Doctors'],['treatments','Treatments'],['packages','Packages'],['specialties','Specialties'],['countries','Countries'],['cities','Cities'],['services','Services'],['verification','Verification'],['cases','Support cases'],['documents','Documents'],['messages','Messages'],['audit','Audit logs'],['analytics','Analytics'],['notifications','Notifications'],['settings','Platform settings']] as const;
export const sectionKind: Record<string, RecordKind> = {profile:'organization',locations:'location',specialties:'specialty',treatments:'treatment',doctors:'doctor',facilities:'facility',accreditations:'accreditation',packages:'package',pricing:'package',international:'international_service'};
export const label = (value: string) => value.replaceAll('_',' ').replace(/\b\w/g, char => char.toUpperCase());
export function portalAllowed(portal: Portal, role: string | null) {
  return portal==='provider'||portal==='patient'||(portal==='admin'?['admin','super_admin'].includes(role??''):['support_agent','support_manager','admin','super_admin'].includes(role??''));
}
export const recordDataSchema = z.record(z.string().max(80), z.union([z.string().max(10000),z.number().finite(),z.boolean(),z.array(z.string().max(500)).max(100),z.null()]));
export const recordInputSchema = z.object({organizationId:z.uuid(),recordId:z.uuid().optional(),expectedRevision:z.int().positive().optional(),kind:z.enum(recordKinds),name:z.string().trim().min(2).max(180),data:recordDataSchema}).strict().superRefine((value,ctx)=>{
  if(value.recordId&&!value.expectedRevision) ctx.addIssue({code:'custom',message:'Reload the current revision before editing.'});
  for(const field of fields[value.kind]) {
    const entry=value.data[field.key];
    if(entry===undefined||entry===''||entry===null) continue;
    if(field.type==='number'&&(typeof entry!=='number'||entry<(field.min??0))) ctx.addIssue({code:'custom',path:['data',field.key],message:`${field.label} must be ${field.min??0} or greater.`});
    if(field.type==='list'&&!Array.isArray(entry)) ctx.addIssue({code:'custom',path:['data',field.key],message:'Enter one item per line.'});
    if(field.options&&!field.options.includes(String(entry))) ctx.addIssue({code:'custom',path:['data',field.key],message:'Choose a listed value.'});
    if(field.type==='url'&&!z.url().safeParse(entry).success) ctx.addIssue({code:'custom',path:['data',field.key],message:'Enter a valid HTTPS URL.'});
    if(field.type==='url'&&!String(entry).startsWith('https://')) ctx.addIssue({code:'custom',path:['data',field.key],message:'Use HTTPS.'});
  }
});
export type PortalContext = {userId:string;role:string|null;email?:string;organizations:{id:string;name:string;role:string;status:string;sourceKind:string}[]};
export type Row = Record<string, unknown> & {id?:string;name?:string;status?:string;revision?:number;data?:Record<string,unknown>};
