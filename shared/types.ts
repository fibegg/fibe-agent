export interface StoredStoryEntry {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  details?: string;
  command?: string;
  path?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StoredActivityEntry {
  id: string;
  created_at: string;
  story: StoredStoryEntry[];
  usage?: TokenUsage;
}
