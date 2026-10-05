import { T } from '@/components/experience/translation';
import { Account } from '@/components/experience/account';
export default async function AccountPage({searchParams}:{searchParams:Promise<{section?:string}>}) {
  const params=await searchParams;
  const section=['profile','preferences','saved','searches','conversations','plans','notifications','privacy'].includes(params.section??'')?params.section!:'profile';
  return <main id="main-content" tabIndex={-1} className="container account-page"><p className="eyebrow">MEDBRIDGE</p><h1><T>{"Account"}</T></h1><Account section={section}/></main>;
}
