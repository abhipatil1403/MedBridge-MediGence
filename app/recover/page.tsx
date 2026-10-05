import { T } from '@/components/experience/translation';
import { RecoveryDashboard } from '@/components/experience/recovery';
export const metadata={title:'Lifetime Recover',description:'An ongoing, private space for non-clinical recovery coordination.'};
export default async function RecoverPage({searchParams}:{searchParams:Promise<{journey?:string}>}) {
  const {journey}=await searchParams;
  return <main id="main-content" tabIndex={-1} className="container recover-page"><header className="recover-opening"><p className="eyebrow"><T>{"Lifetime Recover"}</T></p><h1><T>{"Your treatment may end. Your care journey can continue."}</T></h1><p><T>{"Ongoing coordination, for as long as you choose."}</T></p><p><T>{"Organize follow-ups, provider contacts, private documents and your next steps. Your clinician guides medical care; MedBridge helps you stay organized."}</T></p></header><RecoveryDashboard initialJourney={journey}/></main>;
}
