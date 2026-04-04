import * as os from "os";
import { execSync } from "child_process";
import { detectClaudeCLI } from "../distiller/llm";

export interface RefinedQuery {
  refined_query: string;
  error_codes: string[];
  file_hints: string[];
}

/**
 * Uses Claude CLI to analyze the user's raw prompt and extract
 * a structured search query for more precise memory retrieval.
 */
export function refineQuery(rawPrompt: string): RefinedQuery {
  const claudePath = detectClaudeCLI();
  if (!claudePath) {
    return fallback(rawPrompt);
  }

  try {
    return callClaude(claudePath, rawPrompt);
  } catch {
    return fallback(rawPrompt);
  }
}

/**
 * Fallback: extract what we can from the raw prompt without an LLM.
 */
function fallback(rawPrompt: string): RefinedQuery {
  const errorCodes: string[] = [];

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
  const fileHints: string[] = [];
  const fileMatches = rawPrompt.match(/[\w\-]+\.\w{1,4}/g);
  if (fileMatches) {
    const codeExtensions = new Set(["ts", "js", "tsx", "jsx", "py", "go", "rs", "json", "yaml", "yml", "toml", "env"]);
    for (const match of fileMatches) {
      const ext = match.split(".").pop()!.toLowerCase();
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
function callClaude(claudePath: string, rawPrompt: string): RefinedQuery {
  const prompt = `You are a search query optimizer for a code memory system. Analyze this developer's prompt and extract a structured search query.

Return ONLY a JSON object with:
- "refined_query": A clean, concise version of what the developer is looking for (1-2 sentences, max 200 chars). Focus on the technical problem, remove filler words.
- "error_codes": Array of specific error messages, HTTP status codes, or error class names mentioned or implied (max 5). Include exact strings like "401", "TypeError: fetch failed", "CORS", "ECONNREFUSED".
- "file_hints": Array of file names or paths mentioned or implied (max 5). Include just the filename like "auth.ts", not full paths.

Developer's prompt:
${rawPrompt}`;

  // Strip GIT_* env vars and run in temp dir for isolation
  const env: Record<string, string> = {};
  for (const [key, val] of Object.entries(process.env)) {
    if (!key.startsWith("GIT_") && val !== undefined) {
      env[key] = val;
    }
  }

  const result = execSync(
    `${claudePath} --print --output-format json --model haiku --setting-sources ""`,
    {
      input: prompt,
      cwd: os.tmpdir(),
      encoding: "utf-8",
      env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000, // 30s timeout — query refinement should be fast
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

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
