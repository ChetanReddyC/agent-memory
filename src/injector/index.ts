import { ScoredMemory } from "../types";

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

    if (memory.resolution) {
      lines.push(`Resolution: ${memory.resolution}`);
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
      resolution: memory.resolution,
    })),
    null,
    2
  );
}
