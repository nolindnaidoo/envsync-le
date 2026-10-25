export interface FileInfo {
	readonly filepath: string;
	readonly uri: string;
}

export interface FileSystem {
	/**
	 * Find files matching a pattern in the workspace
	 */
	findFiles(
		pattern: string,
		exclude?: string | null,
		maxResults?: number,
	): Promise<FileInfo[]>;

	/**
	 * Read file contents as text
	 */
	readFile(filepath: string): Promise<string>;

	/**
	 * Convert absolute path to workspace-relative path
	 */
	asRelativePath(filepath: string): string;
}
