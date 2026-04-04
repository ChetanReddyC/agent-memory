import * as fs from "fs";
import * as path from "path";

const HOOK_ID = "agent-memory-auto-inject";

interface ClaudeHookEntry {
  matcher: string;
  hooks: Array<{
    type: string;
    command: string;
  }>;
}

interface ClaudeSettings {
  hooks?: {
    UserPromptSubmit?: ClaudeHookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Generates the shell command that the Claude Code hook will run.
 * Uses a session tracker to only inject once per session (1 hour window).
 */
function generateInjectCommand(cliPath: string): string {
  // The command checks a timestamp file. If it was written less than 60 min ago, skip.
  // Otherwise, run inject and update the timestamp.
  return `bash -c 'REPO="$(git rev-parse --show-toplevel 2>/dev/null || echo .)" && TRACKER="$REPO/.agent-memory/.last-inject" && mkdir -p "$REPO/.agent-memory" && if [ -f "$TRACKER" ]; then AGE=$(( $(date +%s) - $(cat "$TRACKER") )); if [ "$AGE" -lt 3600 ]; then exit 0; fi; fi && date +%s > "$TRACKER" && cd "$REPO" && npx ts-node "${cliPath}" inject "$PROMPT" 2>/dev/null'`;
}

/**
 * Installs the Claude Code UserPromptSubmit hook for auto-injection.
 * Modifies .claude/settings.json in the project directory.
 */
export function installClaudeHook(repoPath: string, cliPath: string): { success: boolean; message: string } {
  const claudeDir = path.join(repoPath, ".claude");
  const settingsPath = path.join(claudeDir, "settings.json");

  // Ensure .claude directory exists
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

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
    (entry) => entry.hooks?.some((h) => h.command?.includes(HOOK_ID) || h.command?.includes("agent-memory"))
  );
  if (existing) {
    return { success: true, message: "Claude Code hook already installed." };
  }

  // Add our hook
  const injectCommand = generateInjectCommand(cliPath);
  settings.hooks.UserPromptSubmit.push({
    matcher: "",
    hooks: [
      {
        type: "command",
        command: `# ${HOOK_ID}\n${injectCommand}`,
      },
    ],
  });

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
    (entry) => !entry.hooks?.some((h) => h.command?.includes(HOOK_ID) || h.command?.includes("agent-memory"))
  );

  // Clean up empty arrays
  if (settings.hooks.UserPromptSubmit.length === 0) {
    delete settings.hooks.UserPromptSubmit;
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
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
      (entry) => entry.hooks?.some((h) => h.command?.includes(HOOK_ID) || h.command?.includes("agent-memory"))
    ) ?? false;
  } catch {
    return false;
  }
}
