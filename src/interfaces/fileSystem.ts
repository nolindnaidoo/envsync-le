export interface FileInfo {
	readonly filepath: string;
	readonly uri: string;
}

export interface FileStats {
	readonly mtime: Date;
	readonly size: number;
	readonly isFile: boolean;
	readonly isDirectory: boolean;
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
	 * Get file metadata
	 */
	getFileStats(filepath: string): Promise<FileStats>;

	/**
	 * Convert absolute path to workspace-relative path
	 */
	asRelativePath(filepath: string): string;

	/**
	 * Check if a file exists
	 */
	fileExists(filepath: string): Promise<boolean>;
}
