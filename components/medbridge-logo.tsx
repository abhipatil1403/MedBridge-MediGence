import Image from 'next/image';

/** The supplied official asset is the only MedBridge brand mark. */
export function MedBridgeLogo({compact=false, onDark=false, priority=false}:{compact?:boolean;onDark?:boolean;priority?:boolean}){
  return <span className={`medbridge-logo${compact?' medbridge-logo--compact':''}${onDark?' medbridge-logo--on-dark':''}`}><Image src="/brand/medbridge-logo.webp" alt="MedBridge" width={1315} height={1197} sizes={compact?'40px':'64px'} priority={priority}/></span>;
}
