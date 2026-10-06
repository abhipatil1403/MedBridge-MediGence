import { T } from '@/components/experience/translation';
import { RecoveryDashboard } from '@/components/experience/recovery';
export const metadata={title:'Lifetime Recover',description:'An ongoing, private space for non-clinical recovery coordination.'};
export default async function RecoverPage({searchParams}:{searchParams:Promise<{journey?:string}>}) {
  const {journey}=await searchParams;
  return <main id="main-content" tabIndex={-1} className="container recover-page"><header className="recover-opening"><p className="eyebrow"><T>{"Lifetime Recover"}</T></p><h1><T>{'Your journey, organized.'}</T></h1><p><T>{'Keep your journey, documents and practical next steps together. Your clinician guides medical care.'}</T></p></header><RecoveryDashboard initialJourney={journey}/></main>;
}
