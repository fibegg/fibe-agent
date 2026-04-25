export interface GemmaRouterResult {
  /** MCP tool names Gemma suggests using to answer the user message. */
  tools: string[];
  /** Confidence score [0, 1] returned by Gemma. */
  confidence: number;
  /** True when Gemma was unavailable, timed out, or returned an unparseable response. */
  skipped: boolean;
}
