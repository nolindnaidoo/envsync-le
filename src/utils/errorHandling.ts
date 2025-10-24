import * as nls from 'vscode-nls';
import type { ParseError } from '../types';

const localize = nls.config({ messageFormat: nls.MessageFormat.file })();

/**
 * Enhanced error handling utilities for EnvSync-LE
 * Provides sophisticated error categorization, recovery, and user feedback
 */

export type ErrorCategory =
	| 'parse'
	| 'validation'
	| 'safety'
	| 'operational'
	| 'file-system'
	| 'configuration';

export interface EnhancedError {
	readonly category: ErrorCategory;
	readonly type: string;
	readonly message: string;
	readonly filepath: string;
	readonly line?: number;
	readonly column?: number;
	readonly context: Record<string, unknown>;
	readonly recoverable: boolean;
	readonly userMessage: string;
	readonly suggestion: string;
}

export interface ErrorRecoveryOptions {
	readonly retryable: boolean;
	readonly maxRetries: number;
	readonly retryDelay: number;
	readonly fallbackAction?: () => Promise<void>;
}

/**
 * Create an enhanced error from a basic error
 */
export function createEnhancedError(
	error: Error | ParseError,
	category: ErrorCategory,
	context?: Record<string, unknown>,
): EnhancedError {
	const baseError =
		'filepath' in error
			? error
			: { message: error.message, filepath: 'unknown' };

	return {
		category,
		type: getErrorType(error, category),
		message: baseError.message,
		filepath: baseError.filepath,
		context: context || {},
		recoverable: isRecoverableError(error, category),
		userMessage: getUserFriendlyMessage(error, category),
		suggestion: getErrorSuggestion(error, category) || '',
	};
}

/**
 * Get error type based on error and category
 */
function getErrorType(
	error: Error | ParseError,
	category: ErrorCategory,
): string {
	switch (category) {
		case 'parse':
			if ('type' in error) return error.type;
			return 'syntax-error';
		case 'file-system':
			return 'file-access-error';
		case 'configuration':
			return 'invalid-setting';
		case 'validation':
			return 'validation-failed';
		case 'safety':
			return 'safety-threshold-exceeded';
		case 'operational':
			return 'operation-failed';
		default:
			return 'unknown-error';
	}
}

/**
 * Determine if an error is recoverable
 */
function isRecoverableError(
	error: Error | ParseError,
	category: ErrorCategory,
): boolean {
	switch (category) {
		case 'parse':
			// Parse errors are recoverable if they don't prevent file processing
			return true;
		case 'file-system':
			// File system errors might be recoverable (permissions, network issues)
			return (
				error.message.includes('permission') ||
				error.message.includes('network')
			);
		case 'configuration':
			// Configuration errors are recoverable (fallback to defaults)
			return true;
		case 'validation':
			// Validation errors are recoverable (skip invalid entries)
			return true;
		case 'safety':
			// Safety errors are not recoverable (user must take action)
			return false;
		case 'operational':
			// Operational errors might be recoverable
			return !error.message.includes('fatal');
		default:
			return false;
	}
}

/**
 * Get user-friendly error message
 */
function getUserFriendlyMessage(
	error: Error | ParseError,
	category: ErrorCategory,
): string {
	const baseError =
		'filepath' in error
			? error
			: { message: error.message, filepath: 'unknown' };

	switch (category) {
		case 'parse':
			return localize(
				'runtime.error.parse',
				'Failed to parse .env file: {0}',
				baseError.filepath || 'unknown file',
			);
		case 'file-system':
			return localize(
				'runtime.error.file-system',
				'File system error: {0}',
				baseError.message,
			);
		case 'configuration':
			return localize(
				'runtime.error.configuration',
				'Configuration error: {0}',
				baseError.message,
			);
		case 'validation':
			return localize(
				'runtime.error.validation',
				'Validation failed: {0}',
				baseError.message,
			);
		case 'safety':
			return localize(
				'runtime.error.safety',
				'Safety threshold exceeded: {0}',
				baseError.message,
			);
		case 'operational':
			return localize(
				'runtime.error.operational',
				'Operation failed: {0}',
				baseError.message,
			);
		default:
			return localize(
				'runtime.error.unknown',
				'Unknown error: {0}',
				baseError.message,
			);
	}
}

/**
 * Get error recovery suggestion
 */
function getErrorSuggestion(
	error: Error | ParseError,
	category: ErrorCategory,
): string {
	const baseError =
		'filepath' in error
			? error
			: { message: error.message, filepath: 'unknown' };

	switch (category) {
		case 'parse':
			return localize(
				'runtime.suggestion.parse',
				'Check the .env file syntax and fix any malformed lines',
			);
		case 'file-system':
			if (baseError.message.includes('permission')) {
				return localize(
					'runtime.suggestion.permission',
					'Check file permissions and ensure the extension has read access',
				);
			}
			if (baseError.message.includes('network')) {
				return localize(
					'runtime.suggestion.network',
					'Check network connectivity and try again',
				);
			}
			return localize(
				'runtime.suggestion.file-system',
				'Check if the file exists and is accessible',
			);
		case 'configuration':
			return localize(
				'runtime.suggestion.configuration',
				'Check your extension settings and fix any invalid values',
			);
		case 'validation':
			return localize(
				'runtime.suggestion.validation',
				'Review the input data and ensure it meets the required format',
			);
		case 'safety':
			return localize(
				'runtime.suggestion.safety',
				'Adjust safety thresholds in settings or reduce the scope of the operation',
			);
		case 'operational':
			return localize(
				'runtime.suggestion.operational',
				'Try reloading the window or restarting VS Code',
			);
		default:
			return localize(
				'runtime.suggestion.unknown',
				'Check the logs for more details and consider reporting this issue',
			);
	}
}

/**
 * Get error recovery options
 */
export function getErrorRecoveryOptions(
	error: EnhancedError,
): ErrorRecoveryOptions {
	switch (error.category) {
		case 'parse':
			return {
				retryable: false,
				maxRetries: 0,
				retryDelay: 0,
			};
		case 'file-system':
			return {
				retryable: true,
				maxRetries: 3,
				retryDelay: 1000,
			};
		case 'configuration':
			return {
				retryable: false,
				maxRetries: 0,
				retryDelay: 0,
				fallbackAction: async () => {
					// Fallback to default configuration
				},
			};
		case 'validation':
			return {
				retryable: false,
				maxRetries: 0,
				retryDelay: 0,
			};
		case 'safety':
			return {
				retryable: false,
				maxRetries: 0,
				retryDelay: 0,
			};
		case 'operational':
			return {
				retryable: true,
				maxRetries: 2,
				retryDelay: 2000,
			};
		default:
			return {
				retryable: false,
				maxRetries: 0,
				retryDelay: 0,
			};
	}
}

/**
 * Sanitize error message for display
 */
export function sanitizeErrorMessage(message: string): string {
	// Remove sensitive information
	return message
		.replace(/\/Users\/[^/]+\//g, '~/')
		.replace(/\/home\/[^/]+\//g, '~/')
		.replace(/C:\\Users\\[^\\]+\\/g, 'C:\\Users\\***\\')
		.replace(/[a-f0-9]{32,}/g, '***') // API keys, tokens
		.replace(/sk-[a-zA-Z0-9]+/g, 'sk-***') // Stripe keys
		.replace(/AKIA[0-9A-Z]{16}/g, 'AKIA***'); // AWS keys
}

/**
 * Format error for logging
 */
export function formatErrorForLogging(error: EnhancedError): string {
	const parts = [
		`[${error.category.toUpperCase()}]`,
		error.type,
		error.message,
	];

	if (error.filepath) {
		parts.push(`File: ${error.filepath}`);
	}

	if (error.line) {
		parts.push(`Line: ${error.line}`);
	}

	if (error.column) {
		parts.push(`Column: ${error.column}`);
	}

	if (error.context) {
		parts.push(`Context: ${JSON.stringify(error.context)}`);
	}

	return parts.join(' | ');
}

/**
 * Check if error should be reported to user
 */
export function shouldReportError(
	error: EnhancedError,
	notificationLevel: 'all' | 'important' | 'silent',
): boolean {
	if (notificationLevel === 'silent') {
		return false;
	}

	if (notificationLevel === 'important') {
		// Only report important errors
		return (
			error.category === 'safety' ||
			error.category === 'operational' ||
			!error.recoverable
		);
	}

	// Report all errors
	return true;
}

/**
 * Get error severity level
 */
export function getErrorSeverity(
	error: EnhancedError,
): 'info' | 'warning' | 'error' {
	switch (error.category) {
		case 'parse':
			return 'warning';
		case 'file-system':
			return 'error';
		case 'configuration':
			return 'warning';
		case 'validation':
			return 'warning';
		case 'safety':
			return 'error';
		case 'operational':
			return 'error';
		default:
			return 'error';
	}
}

/**
 * Create error summary for multiple errors
 */
export function createErrorSummary(errors: readonly EnhancedError[]): {
	total: number;
	byCategory: Record<ErrorCategory, number>;
	bySeverity: Record<string, number>;
	recoverable: number;
	nonRecoverable: number;
} {
	const byCategory: Record<ErrorCategory, number> = {
		parse: 0,
		validation: 0,
		safety: 0,
		operational: 0,
		'file-system': 0,
		configuration: 0,
	};

	const bySeverity: Record<string, number> = {
		info: 0,
		warning: 0,
		error: 0,
	};

	let recoverable = 0;
	let nonRecoverable = 0;

	for (const error of errors) {
		byCategory[error.category]++;
		const severity = getErrorSeverity(error);
		bySeverity[severity] = (bySeverity[severity] || 0) + 1;

		if (error.recoverable) {
			recoverable++;
		} else {
			nonRecoverable++;
		}
	}

	return {
		total: errors.length,
		byCategory,
		bySeverity,
		recoverable,
		nonRecoverable,
	};
}
