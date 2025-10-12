import * as nls from 'vscode-nls';
import type { DotSyncConfig } from '../types';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

/**
 * Safety utilities for EnvSync-LE
 * Provides safety checks and warnings for large files, many files, and performance concerns
 */

export interface SafetyMetrics {
	readonly fileCount: number;
	readonly totalFileSize: number;
	readonly largestFileSize: number;
	readonly averageFileSize: number;
	readonly estimatedProcessingTime: number;
	readonly memoryUsage: number;
}

export interface SafetyCheckResult {
	readonly safe: boolean;
	readonly warnings: readonly string[];
	readonly errors: readonly string[];
	readonly metrics: SafetyMetrics;
	readonly recommendations: readonly string[];
}

/**
 * Perform comprehensive safety checks
 */
export function performSafetyChecks(
	files: readonly { path: string; size: number }[],
	_config: DotSyncConfig,
): SafetyCheckResult {
	const metrics = calculateSafetyMetrics(files);
	const warnings: string[] = [];
	const errors: string[] = [];
	const recommendations: string[] = [];

	// Check file count
	if (metrics.fileCount > 100) {
		errors.push(
			localize(
				'runtime.safety.error.many-files',
				'Too many files ({0}). This may cause performance issues.',
				metrics.fileCount,
			),
		);
		recommendations.push(
			localize(
				'runtime.safety.recommendation.many-files',
				'Consider using exclusion patterns to reduce the number of files being processed',
			),
		);
	} else if (metrics.fileCount > 50) {
		warnings.push(
			localize(
				'runtime.safety.warning.many-files',
				'Many files detected ({0}). Processing may take longer.',
				metrics.fileCount,
			),
		);
	}

	// Check total file size
	if (metrics.totalFileSize > 10 * 1024 * 1024) {
		// 10MB
		errors.push(
			localize(
				'runtime.safety.error.large-total-size',
				'Total file size too large ({0} MB). This may cause memory issues.',
				Math.round(metrics.totalFileSize / (1024 * 1024)),
			),
		);
		recommendations.push(
			localize(
				'runtime.safety.recommendation.large-total-size',
				'Consider processing files in batches or excluding large files',
			),
		);
	} else if (metrics.totalFileSize > 5 * 1024 * 1024) {
		// 5MB
		warnings.push(
			localize(
				'runtime.safety.warning.large-total-size',
				'Large total file size ({0} MB). Processing may take longer.',
				Math.round(metrics.totalFileSize / (1024 * 1024)),
			),
		);
	}

	// Check individual file size
	if (metrics.largestFileSize > 1024 * 1024) {
		// 1MB
		warnings.push(
			localize(
				'runtime.safety.warning.large-file',
				'Large file detected ({0} KB). This may cause performance issues.',
				Math.round(metrics.largestFileSize / 1024),
			),
		);
		recommendations.push(
			localize(
				'runtime.safety.recommendation.large-file',
				'Consider splitting large files or using streaming processing',
			),
		);
	}

	// Check estimated processing time
	if (metrics.estimatedProcessingTime > 10000) {
		// 10 seconds
		errors.push(
			localize(
				'runtime.safety.error.long-processing',
				'Estimated processing time too long ({0} seconds). This may cause UI freezing.',
				Math.round(metrics.estimatedProcessingTime / 1000),
			),
		);
		recommendations.push(
			localize(
				'runtime.safety.recommendation.long-processing',
				'Consider reducing the scope of the operation or processing in batches',
			),
		);
	} else if (metrics.estimatedProcessingTime > 5000) {
		// 5 seconds
		warnings.push(
			localize(
				'runtime.safety.warning.long-processing',
				'Long processing time expected ({0} seconds). Consider reducing scope.',
				Math.round(metrics.estimatedProcessingTime / 1000),
			),
		);
	}

	// Check memory usage
	if (metrics.memoryUsage > 100 * 1024 * 1024) {
		// 100MB
		warnings.push(
			localize(
				'runtime.safety.warning.high-memory',
				'High memory usage expected ({0} MB). Monitor system resources.',
				Math.round(metrics.memoryUsage / (1024 * 1024)),
			),
		);
		recommendations.push(
			localize(
				'runtime.safety.recommendation.high-memory',
				'Consider processing files in smaller batches to reduce memory usage',
			),
		);
	}

	const safe = errors.length === 0;

	return {
		safe,
		warnings: Object.freeze(warnings),
		errors: Object.freeze(errors),
		metrics,
		recommendations: Object.freeze(recommendations),
	};
}

/**
 * Calculate safety metrics
 */
function calculateSafetyMetrics(
	files: readonly { path: string; size: number }[],
): SafetyMetrics {
	const fileCount = files.length;
	const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
	const largestFileSize = Math.max(...files.map((file) => file.size), 0);
	const averageFileSize = fileCount > 0 ? totalFileSize / fileCount : 0;

	// Estimate processing time (rough calculation)
	const estimatedProcessingTime = fileCount * 50 + totalFileSize / 1024; // 50ms per file + 1ms per KB

	// Estimate memory usage (rough calculation)
	const memoryUsage = totalFileSize * 2 + fileCount * 1024; // 2x file size + 1KB per file metadata

	return {
		fileCount,
		totalFileSize,
		largestFileSize,
		averageFileSize,
		estimatedProcessingTime,
		memoryUsage,
	};
}

/**
 * Check if operation should proceed based on safety checks
 */
export function shouldProceedWithOperation(
	safetyResult: SafetyCheckResult,
	config: DotSyncConfig,
): boolean {
	// If safety is disabled, always proceed
	if (!config.safetyEnabled) {
		return true;
	}

	// If there are errors, don't proceed
	if (safetyResult.errors.length > 0) {
		return false;
	}

	// If there are warnings, proceed but show warnings
	return true;
}

/**
 * Get safety configuration recommendations
 */
export function getSafetyRecommendations(
	safetyResult: SafetyCheckResult,
	config: DotSyncConfig,
): readonly string[] {
	const recommendations: string[] = [];

	// Add safety result recommendations
	recommendations.push(...safetyResult.recommendations);

	// Add configuration-specific recommendations
	if (
		safetyResult.metrics.fileCount > 50 &&
		config.excludePatterns.length === 0
	) {
		recommendations.push(
			localize(
				'runtime.safety.recommendation.add-exclusions',
				'Consider adding exclusion patterns to reduce the number of files being processed',
			),
		);
	}

	if (
		safetyResult.metrics.totalFileSize > 5 * 1024 * 1024 &&
		config.debounceMs < 1000
	) {
		recommendations.push(
			localize(
				'runtime.safety.recommendation.increase-debounce',
				'Consider increasing the debounce delay to improve performance with large files',
			),
		);
	}

	if (safetyResult.metrics.fileCount > 20 && config.comparisonMode === 'auto') {
		recommendations.push(
			localize(
				'runtime.safety.recommendation.use-template',
				'Consider using template mode to reduce comparison complexity',
			),
		);
	}

	return Object.freeze(recommendations);
}

/**
 * Format safety report for display
 */
export function formatSafetyReport(safetyResult: SafetyCheckResult): string {
	const lines: string[] = [];

	lines.push('# EnvSync-LE Safety Report');
	lines.push('');

	// Status
	lines.push(
		`**Status**: ${safetyResult.safe ? '✅ Safe' : '⚠️ Warnings/Errors'}`,
	);
	lines.push('');

	// Metrics
	lines.push('## Metrics');
	lines.push(`- **Files**: ${safetyResult.metrics.fileCount}`);
	lines.push(
		`- **Total Size**: ${formatFileSize(safetyResult.metrics.totalFileSize)}`,
	);
	lines.push(
		`- **Largest File**: ${formatFileSize(safetyResult.metrics.largestFileSize)}`,
	);
	lines.push(
		`- **Average File Size**: ${formatFileSize(safetyResult.metrics.averageFileSize)}`,
	);
	lines.push(
		`- **Estimated Processing Time**: ${Math.round(safetyResult.metrics.estimatedProcessingTime / 1000)}s`,
	);
	lines.push(
		`- **Estimated Memory Usage**: ${formatFileSize(safetyResult.metrics.memoryUsage)}`,
	);
	lines.push('');

	// Warnings
	if (safetyResult.warnings.length > 0) {
		lines.push('## ⚠️ Warnings');
		for (const warning of safetyResult.warnings) {
			lines.push(`- ${warning}`);
		}
		lines.push('');
	}

	// Errors
	if (safetyResult.errors.length > 0) {
		lines.push('## ❌ Errors');
		for (const error of safetyResult.errors) {
			lines.push(`- ${error}`);
		}
		lines.push('');
	}

	// Recommendations
	if (safetyResult.recommendations.length > 0) {
		lines.push('## 💡 Recommendations');
		for (const recommendation of safetyResult.recommendations) {
			lines.push(`- ${recommendation}`);
		}
		lines.push('');
	}

	return lines.join('\n');
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	} else if (bytes < 1024 * 1024) {
		return `${Math.round(bytes / 1024)} KB`;
	} else {
		return `${Math.round(bytes / (1024 * 1024))} MB`;
	}
}

/**
 * Check if file should be excluded based on safety criteria
 */
export function shouldExcludeFileForSafety(
	file: { path: string; size: number },
	config: DotSyncConfig,
): boolean {
	// Check file size threshold
	if (config.safetyEnabled && file.size > config.fileSizeWarnBytes) {
		return true;
	}

	return false;
}

/**
 * Get safety configuration defaults
 */
export function getSafetyDefaults(): {
	readonly fileSizeWarnBytes: number;
	readonly maxFilesWarn: number;
	readonly maxTotalSizeWarn: number;
	readonly maxProcessingTimeWarn: number;
} {
	return Object.freeze({
		fileSizeWarnBytes: 1024 * 1024, // 1MB
		maxFilesWarn: 50,
		maxTotalSizeWarn: 5 * 1024 * 1024, // 5MB
		maxProcessingTimeWarn: 5000, // 5 seconds
	});
}
