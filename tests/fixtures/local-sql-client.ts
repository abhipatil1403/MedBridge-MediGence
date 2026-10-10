import { execFileSync } from 'node:child_process';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/** Test transport only: real PostgreSQL queries/RLS with no hosted credentials. */
export function localSqlClient(url:string,role:'postgres'|'service_role'|'authenticated'|'anon',owner?:string){
  const target=new URL(url);
  if(target.hostname!=='127.0.0.1'||target.password||!/^\/production_catalog_.*_agentic_20261010$/.test(target.pathname))
    throw new Error('An isolated loopback workflow database is required.');
  const identifier=(v:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(v))throw new Error('Invalid SQL fixture identifier');return `"${v}"`;};
  const literal=(v:unknown):string=>v===null||v===undefined?'null':typeof v==='number'||typeof v==='boolean'?String(v):`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
  function sql(query:string){
    const prefix=role==='postgres'?'':`set local role ${identifier(role)};`;
    const claims=owner?`set local "request.jwt.claim.sub"=${literal(owner)};`:'';
    const output=execFileSync(process.env.MEDBRIDGE_QA_PSQL??'psql',['-X','-w','-qAt',url,'-v','ON_ERROR_STOP=1'],{input:`begin;${prefix}${claims}${query};commit;`,encoding:'utf8',maxBuffer:4*1024*1024});
    return JSON.parse(output.trim()||'null');
  }
  class Query implements PromiseLike<{data:unknown;error:unknown}>{
    columns='*';mode='select';values:Record<string,unknown>={};filters:string[]=[];ordering='';cap=100;one=false;
    constructor(readonly table:string){}
    select(columns='*'){this.columns=columns==='*'?'*':columns.split(',').map(identifier).join(',');return this;}
    insert(values:Record<string,unknown>){this.mode='insert';this.values=values;return this;}
    update(values:Record<string,unknown>){this.mode='update';this.values=values;return this;}
    eq(key:string,value:unknown){this.filters.push(`${identifier(key)}=${literal(value)}`);return this;}
    neq(key:string,value:unknown){this.filters.push(`${identifier(key)}<>${literal(value)}`);return this;}
    in(key:string,values:unknown[]){this.filters.push(`${identifier(key)} in (${values.map(literal).join(',')})`);return this;}
    order(key:string,options?:{ascending?:boolean}){this.ordering=` order by ${identifier(key)} ${options?.ascending===false?'desc':'asc'}`;return this;}
    limit(n:number){this.cap=n;return this;}
    single(){this.one=true;return this;}
    maybeSingle(){this.one=true;return this;}
    then<TResult1 = {data:unknown;error:unknown},TResult2=never>(ok?:((v:{data:unknown;error:unknown})=>TResult1|PromiseLike<TResult1>)|null,bad?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null):Promise<TResult1|TResult2>{
      return Promise.resolve().then(()=>{
        try{
          const table=`public.${identifier(this.table)}`,where=this.filters.length?` where ${this.filters.join(' and ')}`:'';
          let query:string;
          if(this.mode==='select')query=`select ${this.columns} from ${table}${where}${this.ordering} limit ${this.cap}`;
          else if(this.mode==='insert')query=`insert into ${table}(${Object.keys(this.values).map(identifier).join(',')}) values(${Object.entries(this.values).map(([k,v])=>k==='source_record_ids'&&Array.isArray(v)?`array[${v.map(literal).join(',')}]::uuid[]`:literal(v)).join(',')}) returning ${this.columns}`;
          else query=`update ${table} set ${Object.entries(this.values).map(([k,v])=>`${identifier(k)}=${k==='source_record_ids'&&Array.isArray(v)?`array[${v.map(literal).join(',')}]::uuid[]`:literal(v)}`).join(',')}${where} returning ${this.columns}`;
          const rows=sql(this.mode==='select'?`select coalesce(json_agg(r),'[]'::json) from (${query}) r`:`with r as (${query}) select coalesce(json_agg(r),'[]'::json) from r`);
          return {data:this.one?rows[0]??null:rows,error:null};
        }catch{return {data:null,error:{message:'Local PostgreSQL fixture command failed'}};}
      }).then(ok,bad);
    }
  }
  const client={from:(table:string)=>new Query(table),rpc:async(name:string,args:Record<string,unknown>={})=>{
    try{return {data:sql(`select to_json(public.${identifier(name)}(${Object.entries(args).map(([k,v])=>`${identifier(k)}=>${literal(v)}`).join(',')}))`),error:null};}
    catch{return {data:null,error:{message:'Local PostgreSQL fixture RPC failed'}};}
  }};
  return {db:client as unknown as SupabaseClient<Database>,sql};
}
