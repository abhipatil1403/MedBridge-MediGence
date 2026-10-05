import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const {rpc,from}=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({getPublicSupabaseClient:()=>({rpc,from})}));
import {catalogRepository} from '@/lib/catalog/repository';
const empty=()=>Object.fromEntries(['countries','cities','specialties','treatments','treatment_countries','hospitals','hospital_specialties','hospital_treatments','doctors','doctor_specialties','doctor_treatments','hospital_doctors','packages','package_inclusions','package_exclusions','healthcare_services','price_estimates','package_details','hospital_details','reference_locations','provenance'].map(key=>[key,[]]));
beforeEach(()=>{rpc.mockReset();from.mockReset();});
it('builds one coherent catalog with one transport request and no per-record reads',async()=>{
 rpc.mockResolvedValue({data:empty(),error:null});
 const snapshot=await catalogRepository.loadSnapshot!();
 expect(snapshot.hospitals).toEqual([]);expect(snapshot.doctors).toEqual([]);expect(snapshot.packages).toEqual([]);
 expect(rpc).toHaveBeenCalledExactlyOnceWith('public_catalog_snapshot',{});expect(from).not.toHaveBeenCalled();
});
it('propagates failure without inventing or substituting catalog rows',async()=>{
 rpc.mockResolvedValue({data:null,error:{message:'statement timeout'}});
 await expect(catalogRepository.listHospitals()).rejects.toThrow('Published catalog is unavailable');
 expect(rpc).toHaveBeenCalledTimes(1);expect(from).not.toHaveBeenCalled();
});
it('rejects incomplete transport responses rather than treating missing publication evidence as empty',async()=>{
 const data=empty();delete data.provenance;rpc.mockResolvedValue({data,error:null});
 await expect(catalogRepository.loadSnapshot!()).rejects.toThrow();
});
it('rejects partial relationship responses rather than rendering dangling provider associations',async()=>{
 const data=empty();delete data.hospital_doctors;rpc.mockResolvedValue({data,error:null});
 await expect(catalogRepository.loadSnapshot!()).rejects.toThrow();
});
