'use client';
import {useExperience} from '@/components/experience/provider';
import ChatPanel from '@/components/experience/chat-panel';
import {AssistantWorkspace} from './assistant-workspace';
export function AssistantExperience({configured,initialRequest,initialConversation}:{configured:boolean;initialRequest:string;initialConversation?:string}){
 const {session,authReady}=useExperience();
 if(authReady&&session)return <AssistantWorkspace configured={configured} initialRequest={initialRequest} initialConversation={initialConversation}/>;
 return <ChatPanel open={authReady} mode="page" initialRequest={initialRequest}/>;
}
