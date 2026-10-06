import { T } from '@/components/experience/translation';
import { Account } from '@/components/experience/account';
import { MedBridgeLogo } from '@/components/medbridge-logo';
import Link from '@/components/catalog-link';
export default async function AccountPage({searchParams}:{searchParams:Promise<{section?:string}>}) {
  const params=await searchParams;
  const section=['profile','preferences','saved','searches','conversations','plans','notifications','privacy'].includes(params.section??'')?params.section!:'saved';
  return <main id="main-content" tabIndex={-1} className="container account-page"><header className="account-opening"><div><p className="section-note"><MedBridgeLogo compact/> MEDBRIDGE</p><h1><T>{'My MedBridge'}</T></h1><p className="account-intro"><T>{'Your healthcare information, together. Return to saved options, conversations and your next steps.'}</T></p></div><Link className="account-opening__journey" href="/recover"><span aria-hidden="true">↗</span><strong><T>{'Your journey, organized.'}</T></strong><small><T>{'Continue to Recover'}</T></small></Link></header><Account section={section}/></main>;
}
