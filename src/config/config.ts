import type { Configuration } from '../interfaces'
import type { ComparisonMode, DotSyncConfig, NotificationLevel } from '../types'

export function readConfig(configuration: Configuration): DotSyncConfig {
	const cfg = configuration

	const enabled = Boolean(cfg.get('enabled', true))
	const watchPatterns = cfg.get('watchPatterns', ['**/.env*']) as string[]
	const excludePatterns = cfg.get('excludePatterns', ['.env.*.local']) as string[]
	// Backward-compat: support both `notificationLevel` (preferred) and legacy `notificationsLevel`
	const notifRaw = cfg.get('notificationLevel', cfg.get('notificationsLevel', 'important')) as unknown as string
	const notificationLevel = isValidNotificationLevel(notifRaw) ? notifRaw : 'important'
	const statusBarEnabled = Boolean(cfg.get('statusBar.enabled', true))
	const debounceMs = Math.max(100, Number(cfg.get('debounceMs', 1000)))
	const ignoreComments = Boolean(cfg.get('ignoreComments', true))
	const caseSensitive = Boolean(cfg.get('caseSensitive', true))
	const telemetryEnabled = Boolean(cfg.get('telemetryEnabled', false))
	const comparisonModeRaw = cfg.get('comparisonMode', 'auto')
	const comparisonMode = isValidComparisonMode(comparisonModeRaw) ? comparisonModeRaw : 'auto'
	const compareOnlyFiles = cfg.get('compareOnlyFiles', []) as string[]
	const templateFile = cfg.get('templateFile', undefined as unknown as string | undefined)
	const temporaryIgnore = cfg.get('temporaryIgnore', []) as string[]

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
	})
}

function isValidNotificationLevel(v: unknown): v is NotificationLevel {
	return typeof v === 'string' && ['all', 'important', 'silent'].includes(v)
}

function isValidComparisonMode(v: unknown): v is ComparisonMode {
	return typeof v === 'string' && ['auto', 'manual', 'template'].includes(v)
}
