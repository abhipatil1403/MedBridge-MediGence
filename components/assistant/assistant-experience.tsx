'use client';
import {useExperience} from '@/components/experience/provider';
import ChatPanel from '@/components/experience/chat-panel';
import {AssistantWorkspace} from './assistant-workspace';
export function AssistantExperience({configured,initialRequest,initialConversation,autoStart=false}:{configured:boolean;initialRequest:string;initialConversation?:string;autoStart?:boolean}){
 const {session,authReady}=useExperience();
 if(authReady&&session)return <AssistantWorkspace configured={configured} initialRequest={initialRequest} initialConversation={initialConversation} autoStart={autoStart}/>;
 return <ChatPanel open={authReady} mode="page" initialRequest={initialRequest} autoStart={autoStart}/>;
}
