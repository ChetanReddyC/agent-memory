import { ScoredMemory, MemoryRecord } from "../types";

/**
 * Formats scored memories into a context block ready for agent injection.
 *
 * The output is a structured text block that can be prepended to an agent's
 * system prompt or inserted as the first message in a conversation.
 */
export function formatForInjection(memories: ScoredMemory[]): string {
  if (memories.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("=== AGENT MEMORY — Context from previous sessions ===");
  lines.push("CRITICAL INSTRUCTION: You MUST read and apply these memories BEFORE doing ANY investigation. These contain verified root causes, failed approaches, and warnings from past debugging sessions on this exact codebase. Do NOT re-investigate problems that are already solved here.");
  lines.push("At the START of your response, display this memory summary so the developer can see what context you have:");
  lines.push("");
  lines.push("```");
  lines.push(formatCompactSummary(memories));
  lines.push("```");
  lines.push("Then proceed with your response using the memory context.");
  lines.push("");

  for (const { memory, score } of memories) {
    lines.push(`--- [${memory.date}] ${memory.intent.slice(0, 80)} (relevance: ${Math.round(score)}%) ---`);
    lines.push(`Branch: ${memory.branch} | Files: ${memory.files.join(", ")}`);

    if (memory.decisions.length > 0) {
      lines.push("Decisions:");
      for (const d of memory.decisions) {
        lines.push(`  - ${d}`);
      }
    }

    if (memory.failed_approaches.length > 0) {
      lines.push("Failed approaches (avoid repeating):");
      for (const f of memory.failed_approaches) {
        lines.push(`  - ${f}`);
      }
    }

    if (memory.warnings.length > 0) {
      lines.push("Warnings:");
      for (const w of memory.warnings) {
        lines.push(`  - ${w}`);
      }
    }

    if (memory.error_signatures && memory.error_signatures.length > 0) {
      lines.push("Error signatures:");
      for (const e of memory.error_signatures) {
        lines.push(`  - ${e}`);
      }
    }

    if (memory.cause_chain && memory.cause_chain.length > 0) {
      lines.push("Cause chain:");
      for (const c of memory.cause_chain) {
        lines.push(`  - ${c}`);
      }
    }

    if (memory.file_dependencies && memory.file_dependencies.length > 0) {
      lines.push("File dependencies:");
      for (const d of memory.file_dependencies) {
        lines.push(`  - ${d}`);
      }
    }

    if (memory.resolution) {
      lines.push(`Resolution: ${memory.resolution}`);
    }

    if (memory.key_insight) {
      lines.push(`Key insight: ${memory.key_insight}`);
    }

    lines.push("");
  }

  lines.push("=== END AGENT MEMORY ===");
  return lines.join("\n");
}

/**
 * Formats memories as a compact JSON block — useful for programmatic consumption.
 */
export function formatAsJSON(memories: ScoredMemory[]): string {
  return JSON.stringify(
    memories.map(({ memory, score }) => ({
      date: memory.date,
      relevance: Math.round(score),
      files: memory.files,
      decisions: memory.decisions,
      failed_approaches: memory.failed_approaches,
      warnings: memory.warnings,
      error_signatures: memory.error_signatures,
      cause_chain: memory.cause_chain,
      file_dependencies: memory.file_dependencies,
      resolution: memory.resolution,
      key_insight: memory.key_insight,
    })),
    null,
    2
  );
}

/**
 * Compact summary for Claude to display at the start of its response.
 */
function formatCompactSummary(memories: ScoredMemory[]): string {
  const lines: string[] = [];
  lines.push(`agent-memory | ${memories.length} ${memories.length === 1 ? "memory" : "memories"} loaded`);
  for (const { memory, score } of memories) {
    const insight = memory.key_insight
      ? memory.key_insight.slice(0, 70)
      : memory.intent.slice(0, 70);
    lines.push(`  [${Math.round(score)}%] ${insight} (${shortDate(memory.date)})`);
  }
  return lines.join("\n");
}

/**
 * Formats a short date like "Apr 3", "Mar 28".
 */
function shortDate(dateStr: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const month = months[parseInt(parts[1], 10) - 1] || parts[1];
  const day = parseInt(parts[2], 10);
  return `${month} ${day}`;
}

/**
 * Formats a compact developer-facing summary of injected memories.
 * Shows key insight per memory, relevance score, and short date.
 */
export function formatSummary(memories: ScoredMemory[], branch: string): string {
  if (memories.length === 0) {
    return "agent-memory | no relevant memories found";
  }

  const lines: string[] = [];
  lines.push(`agent-memory | ${memories.length} ${memories.length === 1 ? "memory" : "memories"} injected (branch: ${branch})`);

  for (const { memory, score, breakdown } of memories) {
    const intent = memory.intent.slice(0, 30).padEnd(30);
    const insight = memory.key_insight
      ? `"${memory.key_insight.slice(0, 60)}"`
      : `${memory.decisions[0]?.slice(0, 60) || "no details"}`;
    const date = shortDate(memory.date);

    // Show which signals fired
    const signals: string[] = [];
    if (breakdown.error_match && breakdown.error_match > 0) signals.push(`error:${Math.round(breakdown.error_match)}%`);
    if (breakdown.file_overlap > 0) signals.push(`files:${Math.round(breakdown.file_overlap)}%`);
    const signalStr = signals.length > 0 ? ` (${signals.join(", ")})` : "";

    lines.push(`  [${Math.round(score)}%]${signalStr} ${intent} | ${insight} | ${date}`);
  }

  lines.push(`  view: agent-memory show ${memories[0].memory.checkpoint_id}`);
  return lines.join("\n");
}

/**
 * Formats a one-line distillation notification.
 */
export function formatDistillNotice(record: MemoryRecord): string {
  return `agent-memory | distilled 1 checkpoint (${record.decisions.length} decisions, ${record.warnings.length} warnings)`;
}
