import { T } from '@/components/experience/translation';
import { Account } from '@/components/experience/account';
import { MedBridgeLogo } from '@/components/medbridge-logo';
export default async function AccountPage({searchParams}:{searchParams:Promise<{section?:string}>}) {
  const params=await searchParams;
  const section=['profile','preferences','saved','searches','conversations','plans','notifications','privacy'].includes(params.section??'')?params.section!:'saved';
  return <main id="main-content" tabIndex={-1} className="container account-page"><p className="eyebrow"><MedBridgeLogo compact/> MEDBRIDGE</p><h1><T>{'Your account'}</T></h1><p className="account-intro"><T>{'Your healthcare information, together. Return to saved options, conversations and your next steps.'}</T></p><Account section={section}/></main>;
}
