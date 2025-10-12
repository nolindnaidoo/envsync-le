export interface Workspace {
	/**
	 * Get the workspace root path
	 */
	getRootPath(): string | undefined;

	/**
	 * Check if a path is within the workspace
	 */
	isInWorkspace(filepath: string): boolean;

	/**
	 * Get workspace name
	 */
	getName(): string;

	/**
	 * Check if workspace is trusted
	 */
	isTrusted(): boolean;
}
