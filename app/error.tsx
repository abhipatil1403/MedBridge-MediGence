"use client";

import { T } from '@/components/experience/translation';
import { PageHeader } from "@/components/page-header";

import { useEffect } from "react";
import {usePathname,useRouter} from 'next/navigation';
import Link from '@/components/catalog-link';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const path=usePathname();
  const router=useRouter();
  const kind=path.split('/')[1];
  const title:Record<string,string>={doctors:'We couldn’t load this doctor right now.',hospitals:'We couldn’t load this hospital right now.',packages:'We couldn’t load this package right now.',treatments:'We couldn’t load this treatment right now.'};
  return <main id="main-content" tabIndex={-1} className="container state-page" role="alert"><PageHeader eyebrow="PLEASE TRY AGAIN" title={title[kind]??'We couldn’t load this page.'} /><p><T>{"Please try again. If the problem continues, return later."}</T></p><div className="inline-actions"><button className="button button--primary button--default" type="button" onClick={()=>{reset();router.refresh();}}><T>{"Try again"}</T></button><Link className="text-link" href={title[kind]?`/${kind}`:'/discover'}><T>{'Back to discovery'}</T> →</Link></div></main>;
}
