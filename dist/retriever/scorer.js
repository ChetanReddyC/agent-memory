"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreMemory = scoreMemory;
/**
 * Scores a memory record against the current session context.
 * Uses 5 signals: file overlap, semantic similarity, error signature match, recency, importance.
 */
function scoreMemory(memory, context, embeddingSimilarity, errorCodes) {
    const fileOverlap = computeFileOverlap(memory.files, [
        ...context.modified_files,
        ...context.recent_files,
    ]);
    const semantic = embeddingSimilarity !== undefined
        ? embeddingSimilarity * 100
        : computeKeywordSimilarity(memory, context.prompt);
    const errorMatch = errorCodes && errorCodes.length > 0
        ? computeErrorSignatureMatch(memory, errorCodes)
        : 0;
    const recency = computeRecencyScore(memory.date);
    const importance = computeImportanceScore(memory);
    // Weighted combination — 5 signals
    const score = errorMatch > 0
        ? fileOverlap * 0.3 + semantic * 0.25 + errorMatch * 0.2 + recency * 0.15 + importance * 0.1
        : fileOverlap * 0.4 + semantic * 0.3 + recency * 0.2 + importance * 0.1;
    return {
        memory,
        score,
        breakdown: {
            file_overlap: fileOverlap,
            semantic_similarity: semantic,
            recency,
            decision_importance: importance,
            error_match: errorMatch,
        },
    };
}
/**
 * File overlap: what percentage of current files were touched in this memory?
 */
function computeFileOverlap(memoryFiles, contextFiles) {
    if (!memoryFiles || !contextFiles || contextFiles.length === 0)
        return 0;
    const memoryNames = new Set(memoryFiles.map((f) => f.split("/").pop().toLowerCase()));
    const contextNames = contextFiles.map((f) => f.split(/[/\\]/).pop().toLowerCase());
    let matches = 0;
    for (const name of contextNames) {
        if (memoryNames.has(name))
            matches++;
    }
    return Math.min(100, (matches / contextNames.length) * 100);
}
/**
 * Keyword similarity: fallback when embeddings aren't available.
 */
function computeKeywordSimilarity(memory, prompt) {
    if (!prompt || prompt.trim().length === 0)
        return 0;
    const memoryText = [
        memory.intent || "",
        ...(memory.decisions || []),
        ...(memory.failed_approaches || []),
        ...(memory.warnings || []),
        memory.resolution || "",
        ...(memory.error_signatures || []),
        ...(memory.cause_chain || []),
        ...(memory.file_dependencies || []),
        memory.key_insight || "",
        ...(memory.tags || []),
    ]
        .join(" ")
        .toLowerCase();
    const stopWords = new Set([
        "the", "a", "an", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "can", "this",
        "that", "these", "those", "i", "me", "my", "we", "our",
        "you", "your", "it", "its", "and", "or", "but", "in", "on",
        "at", "to", "for", "of", "with", "from", "not", "no", "so",
        "if", "then", "than", "when", "what", "how", "why", "where",
        "just", "also", "still", "again", "now", "hey", "see", "im",
    ]);
    const promptWords = prompt
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));
    if (promptWords.length === 0)
        return 0;
    let matches = 0;
    for (const word of promptWords) {
        if (memoryText.includes(word))
            matches++;
    }
    return Math.min(100, (matches / promptWords.length) * 100);
}
/**
 * Error signature match: exact match extracted error codes against stored signatures.
 * This is the highest-precision signal — a matching error code is almost always relevant.
 */
function computeErrorSignatureMatch(memory, errorCodes) {
    const signatures = memory.error_signatures || [];
    if (signatures.length === 0 || errorCodes.length === 0)
        return 0;
    const sigText = signatures.join(" ").toLowerCase();
    let matches = 0;
    for (const code of errorCodes) {
        if (sigText.includes(code.toLowerCase())) {
            matches++;
        }
    }
    return Math.min(100, (matches / errorCodes.length) * 100);
}
/**
 * Recency score: exponential decay from today.
 */
function computeRecencyScore(dateStr) {
    const memoryDate = new Date(dateStr);
    const now = new Date();
    const daysAgo = (now.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 100 * Math.exp(-0.05 * daysAgo));
}
/**
 * Importance score: sessions with more decisions, warnings, and failures matter more.
 */
function computeImportanceScore(memory) {
    let score = 0;
    score += Math.min(40, (memory.decisions || []).length * 10);
    score += Math.min(30, (memory.failed_approaches || []).length * 10);
    score += Math.min(30, (memory.warnings || []).length * 10);
    return Math.min(100, score);
}
