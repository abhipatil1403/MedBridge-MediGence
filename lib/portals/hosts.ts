export function portalForHost(host:string,configuration:string|undefined):'provider'|'support'|'admin'|undefined {
  if(!configuration)return;
  let hosts:Record<string,unknown>;
  try{hosts=JSON.parse(configuration);}catch{return;}
  const normalized=host.toLowerCase().replace(/:\d+$/,'');
  for(const portal of ['provider','support','admin'] as const) {
    const value=hosts[portal];
    if(typeof value==='string'&&/^[a-z0-9.-]+$/i.test(value)&&value.toLowerCase()===normalized)return portal;
  }
}
