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
exports.refineQuery = refineQuery;
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
const llm_1 = require("../distiller/llm");
/**
 * Uses Claude CLI to analyze the user's raw prompt and extract
 * a structured search query for more precise memory retrieval.
 */
function refineQuery(rawPrompt) {
    const claudePath = (0, llm_1.detectClaudeCLI)();
    if (!claudePath) {
        return fallback(rawPrompt);
    }
    try {
        return callClaude(claudePath, rawPrompt);
    }
    catch {
        return fallback(rawPrompt);
    }
}
/**
 * Fallback: extract what we can from the raw prompt without an LLM.
 */
function fallback(rawPrompt) {
    const errorCodes = [];
    // Extract HTTP status codes
    const httpMatches = rawPrompt.match(/\b[1-5]\d{2}\b/g);
    if (httpMatches) {
        errorCodes.push(...httpMatches);
    }
    // Extract common error patterns
    const errorPatterns = [
        /TypeError:\s*[\w\s]+/gi,
        /ReferenceError:\s*[\w\s]+/gi,
        /ECONNREFUSED/gi,
        /ETIMEDOUT/gi,
        /ENOTFOUND/gi,
        /CORS/gi,
    ];
    for (const pattern of errorPatterns) {
        const matches = rawPrompt.match(pattern);
        if (matches) {
            errorCodes.push(...matches.map(m => m.trim()));
        }
    }
    // Extract file hints (anything that looks like a file path)
    const fileHints = [];
    const fileMatches = rawPrompt.match(/[\w\-]+\.\w{1,4}/g);
    if (fileMatches) {
        const codeExtensions = new Set(["ts", "js", "tsx", "jsx", "py", "go", "rs", "json", "yaml", "yml", "toml", "env"]);
        for (const match of fileMatches) {
            const ext = match.split(".").pop().toLowerCase();
            if (codeExtensions.has(ext)) {
                fileHints.push(match);
            }
        }
    }
    return {
        refined_query: rawPrompt,
        error_codes: [...new Set(errorCodes)],
        file_hints: [...new Set(fileHints)],
    };
}
/**
 * Calls Claude CLI to refine the search query.
 */
function callClaude(claudePath, rawPrompt) {
    const prompt = `You are a search query optimizer for a code memory system. Analyze this developer's prompt and extract a structured search query.

Return ONLY a JSON object with:
- "refined_query": A clean, concise version of what the developer is looking for (1-2 sentences, max 200 chars). Focus on the technical problem, remove filler words.
- "error_codes": Array of specific error messages, HTTP status codes, or error class names mentioned or implied (max 5). Include exact strings like "401", "TypeError: fetch failed", "CORS", "ECONNREFUSED".
- "file_hints": Array of file names or paths mentioned or implied (max 5). Include just the filename like "auth.ts", not full paths.

Developer's prompt:
${rawPrompt}`;
    // Strip GIT_* env vars and run in temp dir for isolation
    const env = {};
    for (const [key, val] of Object.entries(process.env)) {
        if (!key.startsWith("GIT_") && val !== undefined) {
            env[key] = val;
        }
    }
    const result = (0, child_process_1.execSync)(`${claudePath} --print --output-format json --model haiku --setting-sources ""`, {
        input: prompt,
        cwd: os.tmpdir(),
        encoding: "utf-8",
        env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000, // 30s timeout — query refinement should be fast
        stdio: ["pipe", "pipe", "pipe"],
    });
    const response = JSON.parse(result);
    const text = typeof response.result === "string"
        ? response.result
        : typeof response.content === "string"
            ? response.content
            : JSON.stringify(response);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        return fallback(rawPrompt);
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
        refined_query: parsed.refined_query || rawPrompt,
        error_codes: parsed.error_codes || [],
        file_hints: parsed.file_hints || [],
    };
}
