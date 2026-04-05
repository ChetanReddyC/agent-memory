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
exports.installClaudeHook = installClaudeHook;
exports.uninstallClaudeHook = uninstallClaudeHook;
exports.isClaudeHookInstalled = isClaudeHookInstalled;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const HOOK_ID = "agent-memory-auto-inject";
/**
 * Creates the hook shell script that reads the prompt from stdin,
 * runs agent-memory inject, and outputs the result to stdout
 * (which Claude Code injects into the conversation as context).
 */
function createHookScript() {
    return `#!/bin/bash
# ${HOOK_ID}
# Auto-inject agent memories on first prompt of each new session
# Tracks by session_id so each new session gets memories

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CACHE="$REPO/.agent-memory/inject-cache.txt"
TRACKER="$REPO/.agent-memory/.last-session-id"

# Read stdin JSON to get session_id
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).session_id||'')}catch{console.log('')}})" 2>/dev/null)

# Skip if same session already injected
if [ -f "$TRACKER" ]; then
  LAST_SESSION=$(cat "$TRACKER" 2>/dev/null)
  if [ "$SESSION_ID" = "$LAST_SESSION" ] && [ -n "$SESSION_ID" ]; then
    exit 0
  fi
fi

# Output cached injection if it exists
if [ -f "$CACHE" ]; then
  echo "$SESSION_ID" > "$TRACKER"
  cat "$CACHE"
fi

exit 0
`;
}
/**
 * Installs the Claude Code UserPromptSubmit hook for auto-injection.
 * Creates a hook script and registers it in .claude/settings.json.
 */
function installClaudeHook(repoPath, cliPath) {
    const claudeDir = path.join(repoPath, ".claude");
    const settingsPath = path.join(claudeDir, "settings.json");
    // Ensure .claude directory exists
    if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
    }
    // Create the hook script
    const hookScriptPath = path.join(repoPath, ".agent-memory", "inject-hook.sh");
    const memoriesDir = path.join(repoPath, ".agent-memory");
    if (!fs.existsSync(memoriesDir)) {
        fs.mkdirSync(memoriesDir, { recursive: true });
    }
    fs.writeFileSync(hookScriptPath, createHookScript(), { mode: 0o755, encoding: "utf-8" });
    // Load existing settings or create new
    let settings = {};
    if (fs.existsSync(settingsPath)) {
        try {
            settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        }
        catch {
            settings = {};
        }
    }
    // Ensure hooks structure exists
    if (!settings.hooks) {
        settings.hooks = {};
    }
    if (!settings.hooks.UserPromptSubmit) {
        settings.hooks.UserPromptSubmit = [];
    }
    // Check if already installed
    const existing = settings.hooks.UserPromptSubmit.find((entry) => {
        const cmd = entry.command || entry.hooks?.[0]?.command || "";
        return cmd.includes(HOOK_ID) || cmd.includes("agent-memory");
    });
    if (existing) {
        // Update the script in case path changed
        fs.writeFileSync(hookScriptPath, createHookScript(), { mode: 0o755, encoding: "utf-8" });
        return { success: true, message: "Claude Code hook already installed (script updated)." };
    }
    // Add our hook — must use matcher + hooks format (Claude Code requirement)
    settings.hooks.UserPromptSubmit.push({
        matcher: "",
        hooks: [
            {
                type: "command",
                command: "bash .agent-memory/inject-hook.sh",
            },
        ],
    });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    return { success: true, message: "Claude Code auto-inject hook installed." };
}
/**
 * Removes the Claude Code hook.
 */
function uninstallClaudeHook(repoPath) {
    const settingsPath = path.join(repoPath, ".claude", "settings.json");
    if (!fs.existsSync(settingsPath)) {
        return { success: true, message: "No Claude Code settings found." };
    }
    let settings;
    try {
        settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
    catch {
        return { success: true, message: "Could not parse Claude Code settings." };
    }
    if (!settings.hooks?.UserPromptSubmit) {
        return { success: true, message: "No Claude Code hook found." };
    }
    // Remove our hook entries
    settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter((entry) => {
        const cmd = entry.command || entry.hooks?.[0]?.command || "";
        return !cmd.includes(HOOK_ID) && !cmd.includes("agent-memory");
    });
    // Clean up empty arrays
    if (settings.hooks.UserPromptSubmit.length === 0) {
        delete settings.hooks.UserPromptSubmit;
    }
    if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    // Remove hook script
    const hookScriptPath = path.join(repoPath, ".agent-memory", "inject-hook.sh");
    if (fs.existsSync(hookScriptPath)) {
        fs.unlinkSync(hookScriptPath);
    }
    return { success: true, message: "Claude Code auto-inject hook removed." };
}
/**
 * Checks if the Claude Code hook is installed.
 */
function isClaudeHookInstalled(repoPath) {
    const settingsPath = path.join(repoPath, ".claude", "settings.json");
    if (!fs.existsSync(settingsPath))
        return false;
    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        return settings.hooks?.UserPromptSubmit?.some((entry) => {
            const cmd = entry.command || entry.hooks?.[0]?.command || "";
            return cmd.includes(HOOK_ID) || cmd.includes("agent-memory");
        }) ?? false;
    }
    catch {
        return false;
    }
}
