import * as fs from "fs";
import * as path from "path";

const HOOK_ID = "agent-memory-auto-inject";

interface ClaudeHookEntry {
  type: string;
  command: string;
}

interface ClaudeSettings {
  hooks?: {
    UserPromptSubmit?: ClaudeHookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Creates the hook shell script that reads the prompt from stdin,
 * runs agent-memory inject, and outputs the result to stdout
 * (which Claude Code injects into the conversation as context).
 */
function createHookScript(): string {
  return `#!/bin/bash
# ${HOOK_ID}
# Runs inject with the actual user prompt — no caching, accurate results
# Tracks by session_id so each new session gets memories

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TRACKER="$REPO/.agent-memory/.last-session-id"

# Read stdin JSON to get session_id and prompt
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).session_id||'')}catch{console.log('')}})" 2>/dev/null)
PROMPT=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).prompt||'')}catch{console.log('')}})" 2>/dev/null)

# Skip if same session already injected
if [ -f "$TRACKER" ]; then
  LAST_SESSION=$(cat "$TRACKER" 2>/dev/null)
  if [ "$SESSION_ID" = "$LAST_SESSION" ] && [ -n "$SESSION_ID" ]; then
    exit 0
  fi
fi

if [ -z "$PROMPT" ]; then
  exit 0
fi

# Update tracker
echo "$SESSION_ID" > "$TRACKER"

# Run inject with the actual prompt
cd "$REPO" && agent-memory inject "$PROMPT" 2>/dev/null

exit 0
`;
}

/**
 * Installs the Claude Code UserPromptSubmit hook for auto-injection.
 * Creates a hook script and registers it in .claude/settings.json.
 */
export function installClaudeHook(repoPath: string, cliPath: string): { success: boolean; message: string } {
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
  let settings: ClaudeSettings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    } catch {
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
  const existing = settings.hooks.UserPromptSubmit.find(
    (entry: any) => {
      const cmd = entry.command || entry.hooks?.[0]?.command || "";
      return cmd.includes(HOOK_ID) || cmd.includes("agent-memory");
    }
  );
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
  } as any);

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  return { success: true, message: "Claude Code auto-inject hook installed." };
}

/**
 * Removes the Claude Code hook.
 */
export function uninstallClaudeHook(repoPath: string): { success: boolean; message: string } {
  const settingsPath = path.join(repoPath, ".claude", "settings.json");

  if (!fs.existsSync(settingsPath)) {
    return { success: true, message: "No Claude Code settings found." };
  }

  let settings: ClaudeSettings;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch {
    return { success: true, message: "Could not parse Claude Code settings." };
  }

  if (!settings.hooks?.UserPromptSubmit) {
    return { success: true, message: "No Claude Code hook found." };
  }

  // Remove our hook entries
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
    (entry: any) => {
      const cmd = entry.command || entry.hooks?.[0]?.command || "";
      return !cmd.includes(HOOK_ID) && !cmd.includes("agent-memory");
    }
  );

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
export function isClaudeHookInstalled(repoPath: string): boolean {
  const settingsPath = path.join(repoPath, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return false;

  try {
    const settings: ClaudeSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return settings.hooks?.UserPromptSubmit?.some(
      (entry: any) => {
        const cmd = entry.command || entry.hooks?.[0]?.command || "";
        return cmd.includes(HOOK_ID) || cmd.includes("agent-memory");
      }
    ) ?? false;
  } catch {
    return false;
  }
}
