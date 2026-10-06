import { T } from '@/components/experience/translation';
import { BridgeGlyph } from './journey-art';

export function AIWelcome() {
  return <div className="ai-welcome"><BridgeGlyph/><p className="ai-welcome__identity">MedBridge AI</p><h1 className="ai-landing-title"><T>{'What are you trying to figure out?'}</T></h1><p><T>{'Tell me what you’re looking for. I can help you explore healthcare options, compare what is available and organize the next step.'}</T></p></div>;
}
