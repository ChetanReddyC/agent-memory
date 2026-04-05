/**
 * Installs the Claude Code UserPromptSubmit hook for auto-injection.
 * Creates a hook script and registers it in .claude/settings.json.
 */
export declare function installClaudeHook(repoPath: string, cliPath: string): {
    success: boolean;
    message: string;
};
/**
 * Removes the Claude Code hook.
 */
export declare function uninstallClaudeHook(repoPath: string): {
    success: boolean;
    message: string;
};
/**
 * Checks if the Claude Code hook is installed.
 */
export declare function isClaudeHookInstalled(repoPath: string): boolean;
