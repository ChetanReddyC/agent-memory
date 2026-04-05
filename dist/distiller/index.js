"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCheckpoints = listCheckpoints;
exports.distill = distill;
const child_process_1 = require("child_process");
const extractor_1 = require("./extractor");
const llm_1 = require("./llm");
const embeddings_1 = require("../retriever/embeddings");
/**
 * Reads the raw JSONL transcript from a checkpoint on the Entire branch.
 */
function readCheckpointTranscript(repoPath, checkpointId) {
    const shard = checkpointId.slice(0, 2);
    const remaining = checkpointId.slice(2);
    const gitPath = `${shard}/${remaining}/0/full.jsonl`;
    try {
        const raw = (0, child_process_1.execSync)(`git show entire/checkpoints/v1:${gitPath}`, {
            cwd: repoPath,
            encoding: "utf-8",
            maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large sessions
        });
        return raw
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .map((line) => JSON.parse(line));
    }
    catch {
        throw new Error(`Failed to read transcript for checkpoint ${checkpointId}`);
    }
}
/**
 * Reads checkpoint metadata from the Entire branch.
 */
function readCheckpointMeta(repoPath, checkpointId) {
    const shard = checkpointId.slice(0, 2);
    const remaining = checkpointId.slice(2);
    const gitPath = `${shard}/${remaining}/0/metadata.json`;
    try {
        const raw = (0, child_process_1.execSync)(`git show entire/checkpoints/v1:${gitPath}`, {
            cwd: repoPath,
            encoding: "utf-8",
        });
        return JSON.parse(raw);
    }
    catch {
        throw new Error(`Failed to read metadata for checkpoint ${checkpointId}`);
    }
}
/**
 * Lists all checkpoint IDs in the repository.
 */
function listCheckpoints(repoPath) {
    try {
        const raw = (0, child_process_1.execSync)("git ls-tree -r --name-only entire/checkpoints/v1", {
            cwd: repoPath,
            encoding: "utf-8",
        });
        const checkpointIds = new Set();
        for (const line of raw.split("\n")) {
            // Pattern: XX/YYYYYYYYYY/... → checkpoint ID is XX + YYYYYYYYYY
            const match = line.match(/^([0-9a-f]{2})\/([0-9a-f]+)\//);
            if (match) {
                checkpointIds.add(match[1] + match[2]);
            }
        }
        return Array.from(checkpointIds);
    }
    catch {
        return [];
    }
}
/**
 * Core distillation: takes a raw checkpoint and produces a compact MemoryRecord.
 *
 * Tries LLM-powered distillation (Claude CLI) first for higher quality.
 * Falls back to heuristic extraction if Claude CLI is not available.
 */
async function distill(repoPath, checkpointId, memoriesDir) {
    const meta = readCheckpointMeta(repoPath, checkpointId);
    const entries = readCheckpointTranscript(repoPath, checkpointId);
    const userMessages = (0, extractor_1.extractUserMessages)(entries);
    const assistantMessages = (0, extractor_1.extractAssistantMessages)(entries);
    const toolCalls = (0, extractor_1.extractToolCalls)(entries);
    // Generate searchable tags
    const filesTouched = meta.files_touched || [];
    const tags = (0, extractor_1.generateTags)(filesTouched, userMessages, assistantMessages);
    // Normalize file paths
    const files = filesTouched.map((f) => {
        const parts = f.split(/[/\\]/);
        return parts.slice(-3).join("/");
    });
    // Try LLM distillation first
    const llmResult = (0, llm_1.distillWithLLM)(entries, meta);
    let record;
    if (llmResult) {
        record = {
            checkpoint_id: checkpointId,
            session_id: meta.session_id || checkpointId,
            date: (meta.created_at || new Date().toISOString()).split("T")[0],
            branch: meta.branch || "unknown",
            files,
            tags,
            turn_count: meta.session_metrics?.turn_count || 0,
            token_usage: (meta.token_usage?.output_tokens || 0) + (meta.token_usage?.input_tokens || 0),
            intent: llmResult.intent,
            decisions: llmResult.decisions,
            failed_approaches: llmResult.failed_approaches,
            warnings: llmResult.warnings,
            resolution: llmResult.resolution,
            error_signatures: llmResult.error_signatures || [],
            cause_chain: llmResult.cause_chain || [],
            file_dependencies: llmResult.file_dependencies || [],
            key_insight: llmResult.key_insight || "",
        };
    }
    else {
        // Fallback: heuristic extraction
        const intent = userMessages.length > 0
            ? userMessages[0].slice(0, 200).replace(/\n/g, " ").trim()
            : "Unknown intent";
        const decisions = extractDecisions(assistantMessages);
        const failedApproaches = extractFailures(userMessages, assistantMessages);
        const warnings = extractWarnings(assistantMessages);
        const resolution = extractResolution(assistantMessages);
        record = {
            checkpoint_id: checkpointId,
            session_id: meta.session_id || checkpointId,
            date: (meta.created_at || new Date().toISOString()).split("T")[0],
            branch: meta.branch || "unknown",
            files,
            tags,
            turn_count: meta.session_metrics?.turn_count || 0,
            token_usage: (meta.token_usage?.output_tokens || 0) + (meta.token_usage?.input_tokens || 0),
            intent,
            decisions,
            failed_approaches: failedApproaches,
            warnings,
            resolution,
            error_signatures: [],
            cause_chain: [],
            file_dependencies: [],
            key_insight: "",
        };
    }
    // Generate embedding vector for this memory
    if (memoriesDir) {
        try {
            const embeddingText = (0, embeddings_1.buildEmbeddingText)(record);
            const vector = await (0, embeddings_1.generateEmbedding)(embeddingText);
            const embeddingStore = new embeddings_1.EmbeddingStore(memoriesDir);
            embeddingStore.set(checkpointId, vector);
            embeddingStore.save();
        }
        catch {
            // Embedding generation failed — memory still works without it
        }
    }
    return record;
}
/** Extracts key decisions from assistant messages */
function extractDecisions(messages) {
    const decisions = [];
    const decisionPatterns = [
        /the (?:core |root |main )?(?:issue|problem|cause|error) (?:is|was)[:.]?\s*(.+)/i,
        /root cause[:.]?\s*(.+)/i,
        /(?:i'll|let me|we need to|we should|the fix is to)\s+(.+)/i,
        /(?:changed|updated|switched|modified|replaced)\s+(.+)/i,
    ];
    for (const msg of messages) {
        const sentences = msg.split(/[.!]\s+/);
        for (const sentence of sentences) {
            for (const pattern of decisionPatterns) {
                const match = sentence.match(pattern);
                if (match && match[1] && match[1].length > 20 && match[1].length < 200) {
                    decisions.push(match[1].trim());
                    break;
                }
            }
        }
    }
    // Deduplicate and limit
    return [...new Set(decisions)].slice(0, 5);
}
/** Extracts failed approaches from the conversation */
function extractFailures(userMessages, assistantMessages) {
    const failures = [];
    const failurePatterns = [
        /still (?:getting|seeing|having|shows?)\s+(.+)/i,
        /(?:that |it )?(?:didn't work|still fails|same error|still broken)/i,
        /(?:tried|attempted)\s+(.+?)(?:\s+but|\s+however)/i,
        /even after\s+(.+)/i,
    ];
    for (const msg of [...userMessages, ...assistantMessages]) {
        const sentences = msg.split(/[.!]\s+/);
        for (const sentence of sentences) {
            for (const pattern of failurePatterns) {
                const match = sentence.match(pattern);
                if (match) {
                    const failure = (match[1] || sentence).slice(0, 150).trim();
                    if (failure.length > 15) {
                        failures.push(failure);
                        break;
                    }
                }
            }
        }
    }
    return [...new Set(failures)].slice(0, 5);
}
/** Extracts warnings and caveats from assistant messages */
function extractWarnings(messages) {
    const warnings = [];
    const warningPatterns = [
        /(?:important|note|warning|careful|make sure|don't forget)[:.]?\s*(.+)/i,
        /(?:must|need to|have to|should)\s+(?:also\s+)?(.+)/i,
        /(?:otherwise|or else)\s+(.+)/i,
    ];
    for (const msg of messages) {
        const sentences = msg.split(/[.!]\s+/);
        for (const sentence of sentences) {
            for (const pattern of warningPatterns) {
                const match = sentence.match(pattern);
                if (match && match[1] && match[1].length > 20 && match[1].length < 200) {
                    warnings.push(match[1].trim());
                    break;
                }
            }
        }
    }
    return [...new Set(warnings)].slice(0, 5);
}
/** Extracts the resolution from the last few assistant messages */
function extractResolution(messages) {
    if (messages.length === 0)
        return "Session ended without clear resolution";
    // Take the last 2 assistant messages and look for resolution language
    const lastMessages = messages.slice(-2).join(" ");
    const resolutionPatterns = [
        /(?:fixed|resolved|working|done|completed)[:.]?\s*(.+)/i,
        /(?:the solution was|this fixes|this resolves)\s+(.+)/i,
    ];
    for (const pattern of resolutionPatterns) {
        const match = lastMessages.match(pattern);
        if (match && match[1]) {
            return match[1].slice(0, 200).trim();
        }
    }
    // Fallback: summarize from last message
    const lastMsg = messages[messages.length - 1];
    return lastMsg.slice(0, 200).replace(/\n/g, " ").trim();
}
