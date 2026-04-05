import { ScoredMemory, MemoryRecord } from "../types";
/**
 * Formats scored memories into a context block ready for agent injection.
 *
 * The output is a structured text block that can be prepended to an agent's
 * system prompt or inserted as the first message in a conversation.
 */
export declare function formatForInjection(memories: ScoredMemory[]): string;
/**
 * Formats memories as a compact JSON block — useful for programmatic consumption.
 */
export declare function formatAsJSON(memories: ScoredMemory[]): string;
/**
 * Formats a compact developer-facing summary of injected memories.
 * Shows key insight per memory, relevance score, and short date.
 */
export declare function formatSummary(memories: ScoredMemory[], branch: string): string;
/**
 * Formats a one-line distillation notification.
 */
export declare function formatDistillNotice(record: MemoryRecord): string;
