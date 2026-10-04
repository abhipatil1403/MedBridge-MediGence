import { starterSources, type StarterSource } from "./starter";
export type StarterTaxonomy = {entity:"countries"|"cities"|"specialties"|"treatments";slug:string;name:string;source:StarterSource;data:Record<string, unknown>};
export const starterTaxonomy:StarterTaxonomy[] = [
  {entity:"countries",slug:"india",name:"India",source:"india",data:{iso_code:"IN",description:"India",travel_note:"",aliases:[]}},
  ...([
    ["mumbai","Mumbai","kokilabenContact"], ["pune","Pune","puneCity"], ["new-delhi","New Delhi","maxSaket"], ["bengaluru","Bengaluru","manipalContact"], ["chennai","Chennai","apolloGreams"],
  ] as const).map(([slug,name,source])=>({entity:"cities" as const,slug,name,source,data:{country_id:"$countries:india",aliases:[]}})),
  ...([
    ["orthopedics","Orthopedics","deenOrtho"], ["cardiology","Cardiology","manipalCardio"], ["oncology","Oncology","maxSaket"],
  ] as const).map(([slug,name,source])=>({entity:"specialties" as const,slug,name,source,data:{aliases:[]}})),
  ...([
    ["knee-replacement","Knee Replacement","orthopedics","kokilabenKnee"], ["chemotherapy","Chemotherapy","oncology","maxSaket"],
  ] as const).map(([slug,name,specialty,source])=>({entity:"treatments" as const,slug,name,source,data:{specialty_id:`$specialties:${specialty}`,category:name,description:`${name} is listed on the official provider page. Provider availability is recorded separately for each documented branch.`,overview:"",procedure_summary:"",indications:"",diagnostics:"",recovery:"",typical_stay_days:null,faqs:[],aliases:[]}})),
];
export function taxonomySource(item:StarterTaxonomy){return starterSources[item.source];}
