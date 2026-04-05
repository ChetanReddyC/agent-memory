import { EntireCheckpointMeta, TranscriptEntry } from "../types";
/**
 * Checks if the Claude CLI is available in PATH.
 */
export declare function detectClaudeCLI(): string | null;
/**
 * Calls Claude CLI and parses the JSON response.
 */
interface LLMDistillResult {
    intent: string;
    decisions: string[];
    failed_approaches: string[];
    warnings: string[];
    resolution: string;
    error_signatures: string[];
    cause_chain: string[];
    file_dependencies: string[];
    key_insight: string;
}
/**
 * LLM-powered distillation using Claude CLI.
 * Falls back to null if Claude CLI is not available.
 */
export declare function distillWithLLM(entries: TranscriptEntry[], meta: EntireCheckpointMeta): LLMDistillResult | null;
export {};
