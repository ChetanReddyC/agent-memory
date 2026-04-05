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
exports.isClaudeHookInstalled = exports.uninstallClaudeHook = exports.installClaudeHook = void 0;
exports.resolveCliCommand = resolveCliCommand;
exports.installHook = installHook;
exports.uninstallHook = uninstallHook;
exports.isHookInstalled = isHookInstalled;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
var claude_code_1 = require("./claude-code");
Object.defineProperty(exports, "installClaudeHook", { enumerable: true, get: function () { return claude_code_1.installClaudeHook; } });
Object.defineProperty(exports, "uninstallClaudeHook", { enumerable: true, get: function () { return claude_code_1.uninstallClaudeHook; } });
Object.defineProperty(exports, "isClaudeHookInstalled", { enumerable: true, get: function () { return claude_code_1.isClaudeHookInstalled; } });
const HOOK_START_MARKER = "# >>> agent-memory hook >>>";
const HOOK_END_MARKER = "# <<< agent-memory hook <<<";
/**
 * Detects the best way to invoke agent-memory CLI.
 * Prefers global install, falls back to source path for dev mode.
 */
function resolveCliCommand(fallbackPath) {
    // Check if agent-memory is globally installed
    try {
        (0, child_process_1.execSync)("agent-memory --help", { stdio: "pipe", timeout: 5000 });
        return "agent-memory";
    }
    catch {
        // Not globally installed
    }
    // Fall back to source path (dev mode)
    if (fallbackPath) {
        const unixPath = fallbackPath.replace(/\\/g, "/");
        return `npx ts-node "${unixPath}"`;
    }
    return "agent-memory";
}
/**
 * Generates the hook script content for post-commit auto-distillation.
 */
function generateHookScript(cliCommand) {
    return `
${HOOK_START_MARKER}
# Auto-distill Entire checkpoints into agent memory records
REPO_DIR="$(git rev-parse --show-toplevel)"
LOG_FILE="$REPO_DIR/.agent-memory/distill.log"
mkdir -p "$REPO_DIR/.agent-memory"
(
  cd "$REPO_DIR" && \\
  ${cliCommand} distill --all >> "$LOG_FILE" 2>&1
) &
${HOOK_END_MARKER}
`;
}
/**
 * Installs the post-commit hook in the given repository.
 */
function installHook(repoPath, cliPath) {
    const gitDir = path.join(repoPath, ".git");
    if (!fs.existsSync(gitDir)) {
        return { success: false, message: "Not a git repository." };
    }
    const hooksDir = path.join(gitDir, "hooks");
    if (!fs.existsSync(hooksDir)) {
        fs.mkdirSync(hooksDir, { recursive: true });
    }
    const hookPath = path.join(hooksDir, "post-commit");
    const cliCommand = resolveCliCommand(cliPath);
    const hookScript = generateHookScript(cliCommand);
    if (fs.existsSync(hookPath)) {
        const existing = fs.readFileSync(hookPath, "utf-8");
        if (existing.includes(HOOK_START_MARKER)) {
            return { success: true, message: `Hook already installed (using: ${cliCommand}).` };
        }
        fs.appendFileSync(hookPath, "\n" + hookScript, "utf-8");
        return { success: true, message: `Hook appended (using: ${cliCommand}).` };
    }
    const content = "#!/bin/bash\n" + hookScript;
    fs.writeFileSync(hookPath, content, { mode: 0o755, encoding: "utf-8" });
    return { success: true, message: `Post-commit hook installed (using: ${cliCommand}).` };
}
/**
 * Removes the agent-memory hook from the repository.
 */
function uninstallHook(repoPath) {
    const hookPath = path.join(repoPath, ".git", "hooks", "post-commit");
    if (!fs.existsSync(hookPath)) {
        return { success: true, message: "No post-commit hook found. Nothing to remove." };
    }
    const content = fs.readFileSync(hookPath, "utf-8");
    if (!content.includes(HOOK_START_MARKER)) {
        return { success: true, message: "Agent-memory hook not found. Nothing to remove." };
    }
    const regex = new RegExp(`\\n?${HOOK_START_MARKER}[\\s\\S]*?${HOOK_END_MARKER}\\n?`, "g");
    const cleaned = content.replace(regex, "").trim();
    if (cleaned === "#!/bin/bash" || cleaned === "") {
        fs.unlinkSync(hookPath);
        return { success: true, message: "Post-commit hook removed (was only agent-memory)." };
    }
    fs.writeFileSync(hookPath, cleaned, { mode: 0o755, encoding: "utf-8" });
    return { success: true, message: "Agent-memory hook removed. Other hook content preserved." };
}
/**
 * Checks if the hook is currently installed in the repo.
 */
function isHookInstalled(repoPath) {
    const hookPath = path.join(repoPath, ".git", "hooks", "post-commit");
    if (!fs.existsSync(hookPath))
        return false;
    const content = fs.readFileSync(hookPath, "utf-8");
    return content.includes(HOOK_START_MARKER);
}
