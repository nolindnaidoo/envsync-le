import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockExtensionContext, Uri, workspace } from 'vscode'
import type { Detector } from '../detection/detector'
import type { Configuration, FileSystem } from '../interfaces'
import { registerVSCodeWatchers } from './vscodeWatcher'

describe('registerVSCodeWatchers', () => {
	let detector: Detector
	let configuration: Configuration
	let fileSystem: FileSystem

	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()

		detector = { checkSync: vi.fn().mockResolvedValue(undefined as any), checkSyncForFiles: vi.fn(), dispose: vi.fn() }

		const configStore = new Map<string, any>([
			['enabled', true],
			['watchPatterns', ['**/.env*']],
			['excludePatterns', []],
			['debounceMs', 250],
		])
		configuration = {
			get: (k: string, d: any) => (configStore.has(k) ? configStore.get(k) : d),
			getSection: () => configuration,
			has: (k: string) => configStore.has(k),
		}

		fileSystem = {
			findFiles: vi.fn(),
			readFile: vi.fn(),
			getFileStats: vi.fn(),
			asRelativePath: (p: string) => workspace.asRelativePath(p),
			fileExists: vi.fn(),
		}
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('creates a file system watcher for each pattern and debounces events', async () => {
		registerVSCodeWatchers(mockExtensionContext as any, detector, configuration, fileSystem)

		expect(workspace.createFileSystemWatcher).toHaveBeenCalledTimes(1)

		const watcher = (workspace.createFileSystemWatcher as any).mock.results[0].value

		// Grab the change callback and fire multiple times quickly
		const onChange = watcher.onDidChange.mock.calls[0][0]

		onChange(Uri.file('/root/folder/.env'))
		onChange(Uri.file('/root/folder/.env'))

		expect(detector.checkSync).not.toHaveBeenCalled()

		// Advance timers past debounce
		vi.advanceTimersByTime(300)
		await vi.waitFor(() => {
			expect(detector.checkSync).toHaveBeenCalledTimes(1)
		})
	})

	it('skips events matching exclude patterns', async () => {
		// Override excludePatterns in config
		const cfg = configuration as any
		cfg.get = (k: string, d: any) =>
			k === 'excludePatterns' ? ['**/.env.local'] : ((cfg as any).__proto__.get?.(k, d) ?? d)

		registerVSCodeWatchers(mockExtensionContext as any, detector, configuration, fileSystem)

		const watcher = (workspace.createFileSystemWatcher as any).mock.results[0].value
		const onCreate = watcher.onDidCreate.mock.calls[0][0]

		onCreate(Uri.file('/root/folder/.env.local'))
		vi.advanceTimersByTime(300)
		expect(detector.checkSync).not.toHaveBeenCalled()
	})

	it('registers disposables on the extension context', () => {
		registerVSCodeWatchers(mockExtensionContext as any, detector, configuration, fileSystem)
		// One watcher + one debounce disposer
		expect(mockExtensionContext.subscriptions.push).toHaveBeenCalled()
	})
})
