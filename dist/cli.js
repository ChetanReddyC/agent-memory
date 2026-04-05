#!/usr/bin/env node
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
const path = __importStar(require("path"));
const distiller_1 = require("./distiller");
const llm_1 = require("./distiller/llm");
const store_1 = require("./store");
const retriever_1 = require("./retriever");
const injector_1 = require("./injector");
const hooks_1 = require("./hooks");
const args = process.argv.slice(2);
const command = args[0];
// Resolve repo path — default to current directory
const repoPath = process.cwd();
const memoriesDir = path.join(repoPath, ".agent-memory");
const store = new store_1.MemoryStore(memoriesDir);
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
                const checkpoints = (0, distiller_1.listCheckpoints)(repoPath);
                const claudeAvailable = (0, llm_1.detectClaudeCLI)() !== null;
                console.log(`Distillation mode: ${claudeAvailable ? "LLM (Claude CLI)" : "heuristic (fallback)"}`);
                let distilled = 0;
                let skipped = 0;
                for (const cpId of checkpoints) {
                    if (store.exists(cpId)) {
                        skipped++;
                        continue;
                    }
                    try {
                        const record = await (0, distiller_1.distill)(repoPath, cpId, memoriesDir);
                        store.save(record);
                        console.log(`  ${(0, injector_1.formatDistillNotice)(record)}`);
                        distilled++;
                    }
                    catch (err) {
                        console.error(`  failed: ${cpId} — ${err.message}`);
                    }
                }
                console.log(`\nDone. ${distilled} distilled, ${skipped} skipped (already exists).`);
                console.log(`Total memories: ${store.count()}`);
            }
            else if (target) {
                if (store.exists(target)) {
                    console.log(`Memory already exists for ${target}. Use 'show' to view it.`);
                    return;
                }
                const record = await (0, distiller_1.distill)(repoPath, target, memoriesDir);
                store.save(record);
                console.log(`Distilled checkpoint ${target}:`);
                console.log(JSON.stringify(record, null, 2));
            }
            else {
                console.error("Usage: agent-memory distill <checkpoint-id> | --all");
            }
            break;
        }
        case "recall": {
            const prompt = args.slice(1).join(" ");
            const topK = getFlag("--top", 5);
            const context = (0, retriever_1.gatherContext)(repoPath, prompt);
            const memories = await (0, retriever_1.retrieve)(store, context, topK, memoriesDir);
            if (memories.length === 0) {
                console.log("No relevant memories found.");
                return;
            }
            const format = args.includes("--format") && args[args.indexOf("--format") + 1] === "json";
            if (format) {
                console.log((0, injector_1.formatAsJSON)(memories));
            }
            else {
                for (const { memory, score, breakdown } of memories) {
                    console.log(`\n[${Math.round(score)}%] ${memory.date} — ${memory.intent.slice(0, 60)}`);
                    console.log(`  Files: ${memory.files.join(", ")}`);
                    const errorStr = breakdown.error_match ? ` error=${Math.round(breakdown.error_match)}` : "";
                    console.log(`  Scores: file=${Math.round(breakdown.file_overlap)} semantic=${Math.round(breakdown.semantic_similarity)}${errorStr} recency=${Math.round(breakdown.recency)} importance=${Math.round(breakdown.decision_importance)}`);
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
            const context = (0, retriever_1.gatherContext)(repoPath, prompt);
            const memories = await (0, retriever_1.retrieve)(store, context, topK, memoriesDir);
            const format = args.includes("--format") && args[args.indexOf("--format") + 1] === "json";
            if (format) {
                console.log((0, injector_1.formatAsJSON)(memories));
            }
            else {
                // Developer summary (compact, scannable)
                console.log((0, injector_1.formatSummary)(memories, context.branch));
                console.log("");
                // Full memory block for agent consumption
                const output = (0, injector_1.formatForInjection)(memories);
                if (output) {
                    console.log(output);
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
                console.log(`${m.date || "unknown"} | ${(m.checkpoint_id || "").slice(0, 12)} | ${(m.files || []).length} files | ${(m.decisions || []).length} decisions | ${(m.intent || "").slice(0, 50)}`);
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
            // Install git post-commit hook (auto-distill)
            const gitResult = (0, hooks_1.installHook)(repoPath, cliPath);
            console.log(`[git hook] ${gitResult.message}`);
            // Install Claude Code hook (auto-inject)
            const claudeResult = (0, hooks_1.installClaudeHook)(repoPath, cliPath);
            console.log(`[claude hook] ${claudeResult.message}`);
            if (!gitResult.success || !claudeResult.success)
                process.exit(1);
            console.log("\nSetup complete. Memories will auto-distill on commit and auto-inject on session start.");
            break;
        }
        case "uninstall": {
            const gitResult = (0, hooks_1.uninstallHook)(repoPath);
            console.log(`[git hook] ${gitResult.message}`);
            const claudeResult = (0, hooks_1.uninstallClaudeHook)(repoPath);
            console.log(`[claude hook] ${claudeResult.message}`);
            if (!gitResult.success || !claudeResult.success)
                process.exit(1);
            break;
        }
        case "status": {
            const gitInstalled = (0, hooks_1.isHookInstalled)(repoPath);
            const claudeInstalled = (0, hooks_1.isClaudeHookInstalled)(repoPath);
            console.log(`Git hook (auto-distill):     ${gitInstalled ? "installed" : "not installed"}`);
            console.log(`Claude hook (auto-inject):   ${claudeInstalled ? "installed" : "not installed"}`);
            console.log(`Memories: ${store.count()}`);
            const checkpoints = (0, distiller_1.listCheckpoints)(repoPath);
            console.log(`Checkpoints found: ${checkpoints.length}`);
            console.log(`Undistilled: ${checkpoints.filter(c => !store.exists(c)).length}`);
            break;
        }
        default:
            printUsage();
    }
}
function getFlag(flag, defaultVal) {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length)
        return defaultVal;
    return parseInt(args[idx + 1], 10) || defaultVal;
}
main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
