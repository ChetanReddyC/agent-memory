#!/usr/bin/env node

import * as path from "path";
import { distill, listCheckpoints } from "./distiller";
import { detectClaudeCLI } from "./distiller/llm";
import { MemoryStore } from "./store";
import { gatherContext, retrieve } from "./retriever";
import { formatForInjection, formatAsJSON } from "./injector";
import { installHook, uninstallHook, isHookInstalled } from "./hooks";

const args = process.argv.slice(2);
const command = args[0];

// Resolve repo path — default to current directory
const repoPath = process.cwd();
const memoriesDir = path.join(repoPath, ".agent-memory");
const store = new MemoryStore(memoriesDir);

function printUsage() {
  console.log(`
agent-memory — Persistent memory for AI coding agents

Commands:
  distill [checkpoint-id]   Distill a checkpoint into a memory record
  distill --all             Distill all checkpoints in the repo
  recall [prompt]           Retrieve relevant memories for a prompt
  inject [prompt]           Output formatted context block for agent injection
  list                      List all stored memories
  show [checkpoint-id]      Show a specific memory record
  stats                     Show memory store statistics
  install                   Install post-commit hook for auto-distillation
  uninstall                 Remove the post-commit hook
  status                    Check if hook is installed

Options:
  --repo <path>             Repository path (default: current directory)
  --format json             Output in JSON format
  --top <n>                 Number of memories to retrieve (default: 5)
`);
}

async function main() {
  switch (command) {
    case "distill": {
      const target = args[1];

      if (target === "--all") {
        const checkpoints = listCheckpoints(repoPath);
        const claudeAvailable = detectClaudeCLI() !== null;
        console.log(`Distillation mode: ${claudeAvailable ? "LLM (Claude CLI)" : "heuristic (fallback)"}`);
        let distilled = 0;
        let skipped = 0;

        for (const cpId of checkpoints) {
          if (store.exists(cpId)) {
            skipped++;
            continue;
          }
          try {
            const record = await distill(repoPath, cpId, memoriesDir);
            store.save(record);
            console.log(`  distilled: ${cpId} → ${record.decisions.length} decisions, ${record.warnings.length} warnings`);
            distilled++;
          } catch (err) {
            console.error(`  failed: ${cpId} — ${(err as Error).message}`);
          }
        }

        console.log(`\nDone. ${distilled} distilled, ${skipped} skipped (already exists).`);
        console.log(`Total memories: ${store.count()}`);
      } else if (target) {
        if (store.exists(target)) {
          console.log(`Memory already exists for ${target}. Use 'show' to view it.`);
          return;
        }
        const record = await distill(repoPath, target, memoriesDir);
        store.save(record);
        console.log(`Distilled checkpoint ${target}:`);
        console.log(JSON.stringify(record, null, 2));
      } else {
        console.error("Usage: agent-memory distill <checkpoint-id> | --all");
      }
      break;
    }

    case "recall": {
      const prompt = args.slice(1).join(" ");
      const topK = getFlag("--top", 5);
      const context = gatherContext(repoPath, prompt);
      const memories = await retrieve(store, context, topK, memoriesDir);

      if (memories.length === 0) {
        console.log("No relevant memories found.");
        return;
      }

      const format = args.includes("--format") && args[args.indexOf("--format") + 1] === "json";
      if (format) {
        console.log(formatAsJSON(memories));
      } else {
        for (const { memory, score, breakdown } of memories) {
          console.log(`\n[${Math.round(score)}%] ${memory.date} — ${memory.intent.slice(0, 60)}`);
          console.log(`  Files: ${memory.files.join(", ")}`);
          console.log(`  Scores: file=${Math.round(breakdown.file_overlap)} semantic=${Math.round(breakdown.semantic_similarity)} recency=${Math.round(breakdown.recency)} importance=${Math.round(breakdown.decision_importance)}`);
          if (memory.decisions.length > 0) {
            console.log(`  Decisions: ${memory.decisions[0]}`);
          }
        }
      }
      break;
    }

    case "inject": {
      const prompt = args.slice(1).join(" ");
      const topK = getFlag("--top", 5);
      const context = gatherContext(repoPath, prompt);
      const memories = await retrieve(store, context, topK, memoriesDir);

      const format = args.includes("--format") && args[args.indexOf("--format") + 1] === "json";
      if (format) {
        console.log(formatAsJSON(memories));
      } else {
        const output = formatForInjection(memories);
        if (output) {
          console.log(output);
        } else {
          console.log("No relevant memories to inject.");
        }
      }
      break;
    }

    case "list": {
      const memories = store.loadAll();
      if (memories.length === 0) {
        console.log("No memories stored. Run 'agent-memory distill --all' first.");
        return;
      }

      for (const m of memories) {
        console.log(`${m.date} | ${m.checkpoint_id.slice(0, 12)} | ${m.files.length} files | ${m.decisions.length} decisions | ${m.intent.slice(0, 50)}`);
      }
      console.log(`\nTotal: ${memories.length} memories`);
      break;
    }

    case "show": {
      const cpId = args[1];
      if (!cpId) {
        console.error("Usage: agent-memory show <checkpoint-id>");
        return;
      }
      const record = store.load(cpId);
      if (!record) {
        console.error(`No memory found for checkpoint ${cpId}`);
        return;
      }
      console.log(JSON.stringify(record, null, 2));
      break;
    }

    case "stats": {
      const memories = store.loadAll();
      const totalDecisions = memories.reduce((sum, m) => sum + m.decisions.length, 0);
      const totalWarnings = memories.reduce((sum, m) => sum + m.warnings.length, 0);
      const totalFailures = memories.reduce((sum, m) => sum + m.failed_approaches.length, 0);
      const branches = new Set(memories.map((m) => m.branch));
      const allFiles = new Set(memories.flatMap((m) => m.files));

      console.log(`Agent Memory Stats`);
      console.log(`─────────────────`);
      console.log(`Memories:    ${memories.length}`);
      console.log(`Decisions:   ${totalDecisions}`);
      console.log(`Warnings:    ${totalWarnings}`);
      console.log(`Failures:    ${totalFailures}`);
      console.log(`Branches:    ${branches.size} (${[...branches].join(", ")})`);
      console.log(`Files known: ${allFiles.size}`);

      if (memories.length > 0) {
        console.log(`Date range:  ${memories[memories.length - 1].date} → ${memories[0].date}`);
      }
      break;
    }

    case "install": {
      const cliPath = path.resolve(__dirname, "../src/cli.ts");
      const result = installHook(repoPath, cliPath);
      console.log(result.message);
      if (!result.success) process.exit(1);
      break;
    }

    case "uninstall": {
      const result = uninstallHook(repoPath);
      console.log(result.message);
      if (!result.success) process.exit(1);
      break;
    }

    case "status": {
      const installed = isHookInstalled(repoPath);
      console.log(`Hook status: ${installed ? "installed" : "not installed"}`);
      console.log(`Memories: ${store.count()}`);
      const checkpoints = listCheckpoints(repoPath);
      console.log(`Checkpoints found: ${checkpoints.length}`);
      console.log(`Undistilled: ${checkpoints.filter(c => !store.exists(c)).length}`);
      break;
    }

    default:
      printUsage();
  }
}

function getFlag(flag: string, defaultVal: number): number {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return defaultVal;
  return parseInt(args[idx + 1], 10) || defaultVal;
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
