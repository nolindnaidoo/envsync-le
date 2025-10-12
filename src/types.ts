export type NotificationLevel = 'all' | 'important' | 'silent';

export type SyncStatus =
	| 'in-sync' // All files have matching keys
	| 'missing-keys' // Some files missing keys from others
	| 'extra-keys' // Some files have extra keys
	| 'parse-error' // Cannot parse one or more files
	| 'no-files'; // No dotenv files found

export type DotenvFileType =
	| 'base'
	| 'local'
	| 'example'
	| 'production'
	| 'development'
	| 'test';

export interface DotenvFile {
	readonly path: string;
	readonly type: DotenvFileType;
	readonly keys: readonly string[];
	readonly lastModified: number;
}

export interface ParseResult {
	readonly success: boolean;
	readonly keys: readonly string[];
	readonly errors: readonly ParseError[];
}

export interface ParseError {
	readonly type: 'parse-error' | 'read-error' | 'access-error';
	readonly message: string;
	readonly filepath: string;
}

export interface SyncReport {
	readonly status: SyncStatus;
	readonly files: readonly DotenvFile[];
	readonly missingKeys: readonly KeyMismatch[];
	readonly extraKeys: readonly KeyMismatch[];
	readonly errors: readonly ParseError[];
	readonly lastChecked: number;
}

export interface KeyMismatch {
	readonly filepath: string;
	readonly keys: readonly string[];
	readonly reference: string; // file that has these keys
}

export type ComparisonMode = 'auto' | 'manual' | 'template';

export interface DotSyncConfig {
	readonly enabled: boolean;
	readonly watchPatterns: readonly string[];
	readonly excludePatterns: readonly string[];
	readonly notificationLevel: NotificationLevel;
	readonly statusBarEnabled: boolean;
	readonly debounceMs: number;
	readonly ignoreComments: boolean;
	readonly caseSensitive: boolean;
	readonly telemetryEnabled: boolean;
	readonly comparisonMode: ComparisonMode;
	readonly compareOnlyFiles: readonly string[];
	readonly templateFile: string | undefined;
	readonly temporaryIgnore: readonly string[];
	readonly safetyEnabled: boolean;
	readonly fileSizeWarnBytes: number;
	readonly maxFilesWarn: number;
	readonly maxTotalSizeWarn: number;
	readonly maxProcessingTimeWarn: number;
}

export interface ComparisonRequest {
	readonly mode: 'auto' | 'selected' | 'template';
	readonly files?: readonly string[];
	readonly templateFile?: string;
}
