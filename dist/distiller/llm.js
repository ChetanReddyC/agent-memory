"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectClaudeCLI = detectClaudeCLI;
exports.distillWithLLM = distillWithLLM;
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
/**
 * Checks if the Claude CLI is available in PATH.
 */
function detectClaudeCLI() {
    try {
        const result = (0, child_process_1.execSync)("claude --version", {
            encoding: "utf-8",
            timeout: 5000,
            stdio: ["pipe", "pipe", "pipe"],
        });
        if (result.includes("claude"))
            return "claude";
    }
    catch {
        // Not found in PATH
    }
    // Try common install locations on Windows
    try {
        (0, child_process_1.execSync)("claude.exe --version", {
            encoding: "utf-8",
            timeout: 5000,
            stdio: ["pipe", "pipe", "pipe"],
        });
        return "claude.exe";
    }
    catch {
        // Not found
    }
    return null;
}
/**
 * Formats transcript entries into tagged lines for LLM consumption.
 * Same format Entire uses: [User], [Assistant], [Tool]
 */
function formatTranscript(entries, meta) {
    const lines = [];
    for (const entry of entries) {
        if (entry.type === "user" && entry.message?.content) {
            const content = typeof entry.message.content === "string"
                ? entry.message.content
                : entry.message.content
                    .filter((c) => c.type === "text" && c.text)
                    .map((c) => c.text)
                    .join("\n");
            if (content.trim()) {
                lines.push(`[User] ${content.trim()}`);
            }
        }
        if (entry.type === "assistant" && entry.message?.content) {
            const content = entry.message.content;
            if (typeof content === "string") {
                lines.push(`[Assistant] ${content.trim()}`);
            }
            else {
                for (const block of content) {
                    if (block.type === "text" && block.text) {
                        lines.push(`[Assistant] ${block.text.trim()}`);
                    }
                    if (block.type === "tool_use") {
                        const toolBlock = block;
                        if (toolBlock.name) {
                            lines.push(`[Tool] ${toolBlock.name}`);
                        }
                    }
                }
            }
        }
    }
    // Append files modified
    if (meta.files_touched.length > 0) {
        lines.push("");
        lines.push(`[Files Modified] ${meta.files_touched.join(", ")}`);
    }
    return lines.join("\n");
}
/**
 * Builds the distillation prompt for Claude.
 */
function buildPrompt(transcript) {
    return `Analyze this AI coding session transcript and extract a structured memory record.

Return ONLY a JSON object with these fields:
- "intent": What the user was trying to accomplish (1 sentence, max 200 chars)
- "decisions": Array of key decisions made (max 5, each under 150 chars). Focus on root causes found, architecture choices, and approach changes.
- "failed_approaches": Array of things tried that didn't work (max 5, each under 150 chars). Include what was tried and why it failed.
- "warnings": Array of important caveats discovered (max 5, each under 150 chars). Things future sessions should know to avoid wasting time.
- "resolution": Final outcome in 1 sentence (max 200 chars)
- "error_signatures": Array of exact error messages/codes encountered (max 5). Include HTTP status codes, error class names, and specific error text as they appeared. These are used for exact-match retrieval.
- "cause_chain": Array of debugging paths (max 3, each under 200 chars). Format: "symptom → wrong diagnosis (if any) → actual root cause". Capture the full reasoning path, not just the answer.
- "file_dependencies": Array of concrete coupling rules learned (max 5, each under 150 chars). Format: "changing X requires also updating Y because Z". Only include non-obvious dependencies discovered during the session.
- "key_insight": Single most important takeaway from the entire session (1-2 sentences, max 200 chars). If you could inject only ONE line into a future session, what would save the most time?

Rules:
- Be concise and actionable — these will be injected into future agent sessions
- Skip generic statements, only include things specific to THIS session
- If nothing meaningful was found for a field, use an empty array, empty string, or "No clear resolution"

<transcript>
${transcript}
</transcript>`;
}
function callClaude(claudePath, prompt) {
    // Strip GIT_* env vars and run in temp dir for isolation (same as Entire)
    const env = {};
    for (const [key, val] of Object.entries(process.env)) {
        if (!key.startsWith("GIT_") && val !== undefined) {
            env[key] = val;
        }
    }
    const result = (0, child_process_1.execSync)(`${claudePath} --print --output-format json --model sonnet --setting-sources ""`, {
        input: prompt,
        cwd: os.tmpdir(),
        encoding: "utf-8",
        env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000, // 2 min timeout
        stdio: ["pipe", "pipe", "pipe"],
    });
    // Parse Claude's JSON response
    const response = JSON.parse(result);
    const text = typeof response.result === "string"
        ? response.result
        : typeof response.content === "string"
            ? response.content
            : JSON.stringify(response);
    // Extract JSON from the response text (Claude might wrap it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error("No JSON found in Claude response");
    }
    return JSON.parse(jsonMatch[0]);
}
/**
 * LLM-powered distillation using Claude CLI.
 * Falls back to null if Claude CLI is not available.
 */
function distillWithLLM(entries, meta) {
    const claudePath = detectClaudeCLI();
    if (!claudePath)
        return null;
    try {
        const transcript = formatTranscript(entries, meta);
        const prompt = buildPrompt(transcript);
        return callClaude(claudePath, prompt);
    }
    catch {
        return null; // Fall back to heuristic
    }
}
