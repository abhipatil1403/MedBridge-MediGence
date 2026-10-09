import { RequestForm } from '@/components/inquiries/request-form';
import { entityKind,inquirySources } from '@/lib/inquiries/schemas';
import { z } from 'zod';
import Link from 'next/link';
export const metadata={title:'Request assistance'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const q=await searchParams;const parsed=z.object({kind:entityKind,entityId:z.uuid(),source:z.enum(inquirySources).default('help'),conversation:z.uuid().optional()}).safeParse(q);
  return <main id="main-content" tabIndex={-1} className="container account-page">{parsed.success?<RequestForm kind={parsed.data.kind} entityId={parsed.data.entityId} source={parsed.data.source} conversationId={parsed.data.conversation}/>:<section className="personal-panel"><h1>Choose a published listing</h1><p>Open a hospital, doctor or package and choose Request assistance to attach the exact listing to your question.</p><div className="inline-actions"><Link href="/hospitals" className="text-link">Hospitals →</Link><Link href="/doctors" className="text-link">Doctors →</Link><Link href="/packages" className="text-link">Packages →</Link></div></section>}</main>;
}
