import * as fs from "fs";
import * as path from "path";

export { installClaudeHook, uninstallClaudeHook, isClaudeHookInstalled } from "./claude-code";

const HOOK_START_MARKER = "# >>> agent-memory hook >>>";
const HOOK_END_MARKER = "# <<< agent-memory hook <<<";

/**
 * Generates the hook script content for post-commit auto-distillation.
 * Runs distill --all in background, logs to .agent-memory/distill.log.
 */
function generateHookScript(cliPath: string): string {
  return `
${HOOK_START_MARKER}
# Auto-distill Entire checkpoints into agent memory records
AGENT_MEMORY_CLI="${cliPath}"
REPO_DIR="$(git rev-parse --show-toplevel)"
LOG_FILE="$REPO_DIR/.agent-memory/distill.log"
mkdir -p "$REPO_DIR/.agent-memory"
(
  cd "$REPO_DIR" && \\
  npx ts-node "$AGENT_MEMORY_CLI" distill --all >> "$LOG_FILE" 2>&1
) &
${HOOK_END_MARKER}
`;
}

/**
 * Installs the post-commit hook in the given repository.
 * If a hook already exists, appends our section. Never overwrites.
 */
export function installHook(repoPath: string, cliPath: string): { success: boolean; message: string } {
  const gitDir = path.join(repoPath, ".git");
  if (!fs.existsSync(gitDir)) {
    return { success: false, message: "Not a git repository." };
  }

  const hooksDir = path.join(gitDir, "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = path.join(hooksDir, "post-commit");
  const hookScript = generateHookScript(cliPath);

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf-8");

    // Already installed
    if (existing.includes(HOOK_START_MARKER)) {
      return { success: true, message: "Hook already installed." };
    }

    // Append to existing hook
    fs.appendFileSync(hookPath, "\n" + hookScript, "utf-8");
    return { success: true, message: "Hook appended to existing post-commit hook." };
  }

  // Create new hook
  const content = "#!/bin/bash\n" + hookScript;
  fs.writeFileSync(hookPath, content, { mode: 0o755, encoding: "utf-8" });
  return { success: true, message: "Post-commit hook installed." };
}

/**
 * Removes the agent-memory hook from the repository.
 * Only removes our section, leaves other hook content intact.
 */
export function uninstallHook(repoPath: string): { success: boolean; message: string } {
  const hookPath = path.join(repoPath, ".git", "hooks", "post-commit");

  if (!fs.existsSync(hookPath)) {
    return { success: true, message: "No post-commit hook found. Nothing to remove." };
  }

  const content = fs.readFileSync(hookPath, "utf-8");

  if (!content.includes(HOOK_START_MARKER)) {
    return { success: true, message: "Agent-memory hook not found. Nothing to remove." };
  }

  // Remove our section
  const regex = new RegExp(
    `\\n?${HOOK_START_MARKER}[\\s\\S]*?${HOOK_END_MARKER}\\n?`,
    "g"
  );
  const cleaned = content.replace(regex, "").trim();

  if (cleaned === "#!/bin/bash" || cleaned === "") {
    // Hook is now empty — remove the file
    fs.unlinkSync(hookPath);
    return { success: true, message: "Post-commit hook removed (was only agent-memory)." };
  }

  // Other hook content remains
  fs.writeFileSync(hookPath, cleaned, { mode: 0o755, encoding: "utf-8" });
  return { success: true, message: "Agent-memory hook removed. Other hook content preserved." };
}

/**
 * Checks if the hook is currently installed in the repo.
 */
export function isHookInstalled(repoPath: string): boolean {
  const hookPath = path.join(repoPath, ".git", "hooks", "post-commit");
  if (!fs.existsSync(hookPath)) return false;
  const content = fs.readFileSync(hookPath, "utf-8");
  return content.includes(HOOK_START_MARKER);
}
