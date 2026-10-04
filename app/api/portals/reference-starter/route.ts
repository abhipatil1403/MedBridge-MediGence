import { NextRequest } from "next/server";
import { z } from "zod";
import { portalSession, portalResponse, portalFailure, PortalError } from "@/lib/portals/server";
import { prepareProvider, prepareTaxonomy } from "@/lib/reference-data/onboarding";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=120;
const inputSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("prepare_taxonomy")}).strict(),
  z.object({action:z.literal("prepare_provider"),key:z.string().max(80)}).strict(),
]);
export async function POST(request:NextRequest){
  try{
    const session=await portalSession(request);
    if(session.portal!=="admin" || !["admin","super_admin"].includes(session.context.role??"")) throw new PortalError(403,"Only administrators may prepare reference data.");
    const input=inputSchema.parse(await request.json());
    return portalResponse(input.action==="prepare_taxonomy" ? await prepareTaxonomy(session.db):await prepareProvider(session.db,input.key));
  }catch(error){return portalFailure(error);}
}
