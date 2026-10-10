import {NextRequest,NextResponse} from 'next/server';
import {monitorAuthorized,monitorSnapshot} from '@/lib/operations/monitor';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:NextRequest) {
 if(!monitorAuthorized(request.headers.get('authorization')))return NextResponse.json({error:'Monitor access unavailable.'},{status:401,headers});
 try{return NextResponse.json(await monitorSnapshot(),{headers});}
 catch{return NextResponse.json({error:'Monitor probe unavailable.'},{status:503,headers});}
}
