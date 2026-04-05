export { installClaudeHook, uninstallClaudeHook, isClaudeHookInstalled } from "./claude-code";
/**
 * Detects the best way to invoke agent-memory CLI.
 * Prefers global install, falls back to source path for dev mode.
 */
export declare function resolveCliCommand(fallbackPath?: string): string;
/**
 * Installs the post-commit hook in the given repository.
 */
export declare function installHook(repoPath: string, cliPath: string): {
    success: boolean;
    message: string;
};
/**
 * Removes the agent-memory hook from the repository.
 */
export declare function uninstallHook(repoPath: string): {
    success: boolean;
    message: string;
};
/**
 * Checks if the hook is currently installed in the repo.
 */
export declare function isHookInstalled(repoPath: string): boolean;
