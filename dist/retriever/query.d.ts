export interface RefinedQuery {
    refined_query: string;
    error_codes: string[];
    file_hints: string[];
}
/**
 * Uses Claude CLI to analyze the user's raw prompt and extract
 * a structured search query for more precise memory retrieval.
 */
export declare function refineQuery(rawPrompt: string): RefinedQuery;
/**
 * Fast query refinement — regex only, no LLM call.
 * Used by hooks where speed is critical (~1ms vs ~15s).
 */
export declare function refineQueryFast(rawPrompt: string): RefinedQuery;
