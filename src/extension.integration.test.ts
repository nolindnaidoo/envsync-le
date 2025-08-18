import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commands, mockExtensionContext, Uri, workspace } from 'vscode'

describe('extension activation', () => {
	const fakeDetector = {
		checkSync: vi.fn().mockResolvedValue(undefined as any),
		checkSyncForFiles: vi.fn(),
		dispose: vi.fn(),
	}

	beforeEach(() => {
		vi.useFakeTimers()
		vi.clearAllMocks()
		// Ensure configuration has required API
		;(workspace.getConfiguration as any).mockReturnValue({
			get: (_k: string, d: any) => d,
			update: vi.fn(),
			has: vi.fn(),
		})
		// Mock createDetector to control side effects
		vi.doMock('./detection/detector', () => ({
			createDetector: () => fakeDetector,
		}))
		// Mock configuration adapter to always return provided defaults
		vi.doMock('./adapters/vscodeConfiguration', () => ({
			createVSCodeConfiguration: () => ({
				get: (_k: string, d: any) => d,
				getSection: () => ({
					get: (_k: string, d: any) => d,
					getSection: function () {
						return this as any
					},
					has: () => false,
				}),
				has: () => false,
			}),
		}))
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('activates, registers commands and watchers, and runs initial check', async () => {
		const { activate } = await import('./extension')

		activate(mockExtensionContext as any)

		// Commands registered (openSettings and others)
		const registered = (commands.registerCommand as any).mock.calls.map((c: any[]) => c[0])
		expect(registered).toContain('envsync-le.openSettings')
		expect(registered).toContain('envsync-le.compareSelected')
		expect(registered).toContain('envsync-le.setTemplate')
		expect(registered).toContain('envsync-le.ignoreFile')

		// Watcher created
		expect(workspace.createFileSystemWatcher).toHaveBeenCalled()

		// Initial check triggered
		expect(fakeDetector.checkSync).toHaveBeenCalled()

		// Fire a file event and ensure debounced detection runs
		const watcher = (workspace.createFileSystemWatcher as any).mock.results[0].value
		const onChange = watcher.onDidChange.mock.calls[0][0]
		onChange(Uri.file('/root/.env'))
		vi.advanceTimersByTime(1100)
		expect(fakeDetector.checkSync).toHaveBeenCalledTimes(2)
	})

	it('deactivates without error', async () => {
		const { deactivate } = await import('./extension')
		expect(() => deactivate()).not.toThrow()
	})

	it('handles initial detector error to hit catch path', async () => {
		vi.resetModules()
		;(workspace.getConfiguration as any).mockReturnValue({
			get: (_: string, d: any) => d,
			update: vi.fn(),
			has: vi.fn(),
		})
		const failingDetector = {
			checkSync: vi.fn().mockRejectedValue(new Error('boom')),
			checkSyncForFiles: vi.fn(),
			dispose: vi.fn(),
		}
		vi.doMock('./detection/detector', () => ({ createDetector: () => failingDetector }))
		const { activate } = await import('./extension')
		activate(mockExtensionContext as any)
		expect(failingDetector.checkSync).toHaveBeenCalled()
	})
})
