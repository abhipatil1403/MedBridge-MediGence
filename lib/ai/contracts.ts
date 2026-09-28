/** Boundaries for future provider adapters. No model or patient data is connected. */
export type ToolSideEffect = "read" | "propose" | "write";

export interface ModelRequest {
  purpose: string;
  messages: ReadonlyArray<{ role: "system" | "user" | "assistant"; content: string }>;
  maxOutputTokens: number;
}

export interface ModelResponse {
  content: string;
  provider: string;
  model: string;
  requestId: string;
}

export interface LLMProvider {
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export interface ToolContext {
  actorId: string;
  caseId?: string;
  purpose: string;
  traceId: string;
}

export interface AgentTool<Input, Output> {
  name: string;
  version: string;
  sideEffect: ToolSideEffect;
  execute(input: Input, context: ToolContext): Promise<Output>;
}
