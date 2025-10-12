import type { Configuration } from '../interfaces';
import type {
	ComparisonMode,
	DotSyncConfig,
	NotificationLevel,
} from '../types';

export function readConfig(configuration: Configuration): DotSyncConfig {
	const cfg = configuration;

	const enabled = Boolean(cfg.get('enabled', true));
	const watchPatterns = cfg.get('watchPatterns', ['.env*']) as string[];
	const excludePatterns = cfg.get('excludePatterns', [
		'.env.*.local',
	]) as string[];
	// Backward-compat: support both `notificationLevel` (preferred) and legacy `notificationsLevel`
	const notifRaw = cfg.get(
		'notificationLevel',
		cfg.get('notificationsLevel', 'important'),
	) as unknown as string;
	const notificationLevel = isValidNotificationLevel(notifRaw)
		? notifRaw
		: 'important';
	const statusBarEnabled = Boolean(cfg.get('statusBar.enabled', true));
	const debounceMs = Math.max(100, Number(cfg.get('debounceMs', 1000)));
	const ignoreComments = Boolean(cfg.get('ignoreComments', true));
	const caseSensitive = Boolean(cfg.get('caseSensitive', true));
	const telemetryEnabled = Boolean(cfg.get('telemetryEnabled', false));
	const comparisonModeRaw = cfg.get('comparisonMode', 'auto');
	const comparisonMode = isValidComparisonMode(comparisonModeRaw)
		? comparisonModeRaw
		: 'auto';
	const compareOnlyFiles = cfg.get('compareOnlyFiles', []) as string[];
	const templateFile = cfg.get(
		'templateFile',
		undefined as unknown as string | undefined,
	);
	const temporaryIgnore = cfg.get('temporaryIgnore', []) as string[];
	const safetyEnabled = Boolean(cfg.get('safety.enabled', false));
	const fileSizeWarnBytes = Math.max(
		1024,
		Number(cfg.get('safety.fileSizeWarnBytes', 1024 * 1024)),
	);
	const maxFilesWarn = Math.max(1, Number(cfg.get('safety.maxFilesWarn', 50)));
	const maxTotalSizeWarn = Math.max(
		1024 * 1024,
		Number(cfg.get('safety.maxTotalSizeWarn', 5 * 1024 * 1024)),
	);
	const maxProcessingTimeWarn = Math.max(
		1000,
		Number(cfg.get('safety.maxProcessingTimeWarn', 5000)),
	);
	const performanceEnabled = Boolean(cfg.get('performance.enabled', true));
	const performanceMaxDuration = Math.max(
		1000,
		Number(cfg.get('performance.maxDuration', 5000)),
	);
	const performanceMaxMemoryUsage = Math.max(
		1048576,
		Number(cfg.get('performance.maxMemoryUsage', 104857600)),
	);
	const performanceMaxCpuUsage = Math.max(
		100000,
		Number(cfg.get('performance.maxCpuUsage', 1000000)),
	);
	const performanceMinThroughput = Math.max(
		100,
		Number(cfg.get('performance.minThroughput', 1000)),
	);
	const performanceMaxCacheSize = Math.max(
		100,
		Number(cfg.get('performance.maxCacheSize', 1000)),
	);

	// Freeze to communicate immutability to consumers
	return Object.freeze({
		enabled,
		watchPatterns: Object.freeze([...watchPatterns]),
		excludePatterns: Object.freeze([...excludePatterns]),
		notificationLevel,
		statusBarEnabled,
		debounceMs,
		ignoreComments,
		caseSensitive,
		telemetryEnabled,
		comparisonMode,
		compareOnlyFiles: Object.freeze([...compareOnlyFiles]),
		templateFile,
		temporaryIgnore: Object.freeze([...temporaryIgnore]),
		safetyEnabled,
		fileSizeWarnBytes,
		maxFilesWarn,
		maxTotalSizeWarn,
		maxProcessingTimeWarn,
		performanceEnabled,
		performanceMaxDuration,
		performanceMaxMemoryUsage,
		performanceMaxCpuUsage,
		performanceMinThroughput,
		performanceMaxCacheSize,
	});
}

function isValidNotificationLevel(v: unknown): v is NotificationLevel {
	return typeof v === 'string' && ['all', 'important', 'silent'].includes(v);
}

function isValidComparisonMode(v: unknown): v is ComparisonMode {
	return typeof v === 'string' && ['auto', 'manual', 'template'].includes(v);
}
