"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatherContext = gatherContext;
exports.retrieve = retrieve;
const child_process_1 = require("child_process");
const scorer_1 = require("./scorer");
const embeddings_1 = require("./embeddings");
const query_1 = require("./query");
/** Default: return top 5 memories */
const DEFAULT_TOP_K = 5;
/** Minimum score threshold — below this, memory isn't relevant enough */
const MIN_SCORE_THRESHOLD = 18;
/**
 * Gathers the current session context from the git repository.
 */
function gatherContext(repoPath, prompt) {
    let modifiedFiles = [];
    let recentFiles = [];
    let branch = "unknown";
    try {
        branch = (0, child_process_1.execSync)("git branch --show-current", {
            cwd: repoPath,
            encoding: "utf-8",
        }).trim();
    }
    catch {
        // Ignore
    }
    try {
        const diff = (0, child_process_1.execSync)("git diff --name-only HEAD", {
            cwd: repoPath,
            encoding: "utf-8",
        });
        modifiedFiles = diff.split("\n").filter((f) => f.trim().length > 0);
    }
    catch {
        // Ignore — might be initial commit
    }
    try {
        const log = (0, child_process_1.execSync)("git log -3 --name-only --pretty=format:", {
            cwd: repoPath,
            encoding: "utf-8",
        });
        recentFiles = [...new Set(log.split("\n").filter((f) => f.trim().length > 0))];
    }
    catch {
        // Ignore
    }
    return {
        modified_files: modifiedFiles,
        branch,
        prompt,
        recent_files: recentFiles,
    };
}
/**
 * Retrieves the most relevant memories using LLM-enhanced query refinement,
 * embedding-based semantic similarity, and error signature matching.
 * Falls back gracefully at each layer.
 */
async function retrieve(store, context, topK = DEFAULT_TOP_K, memoriesDir) {
    const allMemories = store.loadAll();
    if (allMemories.length === 0)
        return [];
    // Step 1: Refine the query using LLM (or heuristic fallback)
    const refined = (0, query_1.refineQuery)(context.prompt);
    // Merge file hints from query refinement into context files
    const enhancedContext = {
        ...context,
        recent_files: [
            ...context.recent_files,
            ...refined.file_hints,
        ],
    };
    // Step 2: Generate embedding for the refined query
    let promptEmbedding = null;
    let embeddingStore = null;
    if (memoriesDir) {
        try {
            embeddingStore = new embeddings_1.EmbeddingStore(memoriesDir);
            promptEmbedding = await (0, embeddings_1.generateEmbedding)(refined.refined_query);
        }
        catch {
            promptEmbedding = null;
        }
    }
    // Step 3: Score every memory with all 5 signals
    const scored = allMemories
        .map((memory) => {
        let embeddingSimilarity;
        if (promptEmbedding && embeddingStore) {
            const memoryVector = embeddingStore.get(memory.checkpoint_id);
            if (memoryVector) {
                embeddingSimilarity = (0, embeddings_1.cosineSimilarity)(promptEmbedding, memoryVector);
            }
        }
        return (0, scorer_1.scoreMemory)(memory, enhancedContext, embeddingSimilarity, refined.error_codes);
    })
        .filter((sm) => sm.score >= MIN_SCORE_THRESHOLD)
        .sort((a, b) => b.score - a.score);
    // Quality gate applied PER MEMORY:
    // - If the best memory has weak content signals (semantic + error < 30), inject nothing
    // - Each individual memory must also have content signals >= 20 to be included
    // This prevents weakly-related memories from riding the coattails of relevant ones
    if (scored.length > 0) {
        const best = scored[0];
        const bestContentScore = Math.max(best.breakdown.semantic_similarity, best.breakdown.error_match || 0);
        if (bestContentScore < 30) {
            return [];
        }
    }
    const qualified = scored.filter((sm) => {
        const contentScore = Math.max(sm.breakdown.semantic_similarity, sm.breakdown.error_match || 0);
        return contentScore >= 30;
    });
    return qualified.slice(0, topK);
}
