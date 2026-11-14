/** Opt-in schema for the final answer of a single agent turn. */
export interface ResponseFormat {
  type: 'json_schema';
  schema: Record<string, unknown>;
}
