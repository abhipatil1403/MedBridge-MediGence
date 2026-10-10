export type Signal='application'|'dependency_probe'|'storage'|'ai_configuration'|'request_failures'|'workflow_failed'|'workflow_stalled'|'documents_blocked'|'scanner_configuration'|'incident_unowned'|'alert_delivery';
export type Alert={id:string;signal:Signal;event:'signal_detected'|'signal_persists'|'signal_cleared';observedAt:string;state:'pending'|'unknown'|'accepted'|'failed'|'not_configured';attempts:number;nextAt:number;category:string};
export type State={version:1;target:string;samples:Partial<Record<Signal,{failures:number;successes:number;episode:string|null;lastNotice:number}>>;alerts:Alert[]};
export const signals:Signal[];
export const stateSchema:import('zod').ZodType<State>;
export function emptyState(target:string):State;
export function observe(state:State,observations:Partial<Record<Signal,boolean>>,now?:number):State;
export function deliver(state:State,config:{url?:string;token?:string;timeoutMs?:number},persist:(state:State)=>Promise<unknown>,fetcher?:typeof fetch,now?:number):Promise<State>;
export function collect(origin:string|URL,token?:string,fetcher?:typeof fetch,timeoutMs?:number,now?:number):Promise<Partial<Record<Signal,boolean>>>;
