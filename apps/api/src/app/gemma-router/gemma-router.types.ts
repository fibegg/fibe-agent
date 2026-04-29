export type RouterAction =
  | { type: 'EXECUTE_CLI'; command: string; reason?: string }
  | { type: 'DELEGATE_TO_AGENT'; tools: string[]; confidence: number };

export interface GemmaRouterResult {
  action?: RouterAction;
  /** True when Gemma was unavailable, timed out, or returned an unparseable response. */
  skipped: boolean;
}
