export class AgentError extends Error {
  constructor(public readonly code: string, public readonly publicMessage: string, cause?: unknown) {
    super(code, { cause });
    this.name = 'AgentError';
  }
}
