/** Raw checkpoint metadata from Entire's checkpoint branch */
export interface EntireCheckpointMeta {
  cli_version: string;
  checkpoint_id: string;
  session_id: string;
  strategy: string;
  created_at: string;
  branch: string;
  checkpoints_count: number;
  files_touched: string[];
  agent: string;
  model: string;
  token_usage: {
    input_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    output_tokens: number;
    api_call_count: number;
  };
  session_metrics: {
    turn_count: number;
  };
}

/** A single turn in the raw JSONL transcript */
export interface TranscriptEntry {
  type: "user" | "assistant" | "attachment" | "permission-mode" | "file-history-snapshot";
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string; thinking?: string }>;
  };
  parentUuid?: string;
  uuid?: string;
  timestamp?: string;
  [key: string]: unknown;
}

/** The distilled memory record — compact, structured, queryable */
export interface MemoryRecord {
  checkpoint_id: string;
  session_id: string;
  date: string;
  branch: string;
  files: string[];
  tags: string[];
  turn_count: number;
  token_usage: number;

  /** What the user was trying to accomplish */
  intent: string;

  /** Key decisions made during the session */
  decisions: string[];

  /** Approaches that were tried and failed */
  failed_approaches: string[];

  /** Important things to remember for future sessions */
  warnings: string[];

  /** Final outcome / what was resolved */
  resolution: string;

  /** Exact error messages/codes encountered during the session */
  error_signatures: string[];

  /** Debugging path: symptom → misdiagnosis → actual root cause */
  cause_chain: string[];

  /** Concrete file coupling rules learned: "change A → must also change B" */
  file_dependencies: string[];

  /** Single most important takeaway from the entire session */
  key_insight: string;
}

/** Context gathered at the start of a new session */
export interface SessionContext {
  /** Files currently modified (from git diff) */
  modified_files: string[];

  /** Current branch name */
  branch: string;

  /** User's first prompt */
  prompt: string;

  /** Recently committed files */
  recent_files: string[];
}

/** A scored memory ready for injection */
export interface ScoredMemory {
  memory: MemoryRecord;
  score: number;
  breakdown: {
    file_overlap: number;
    semantic_similarity: number;
    recency: number;
    decision_importance: number;
    error_match?: number;
  };
}
