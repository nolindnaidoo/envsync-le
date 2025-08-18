import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commands, Uri, workspace } from 'vscode'
import type { Detector } from '../detection/detector'
import type { Configuration, FileSystem, UserInterface } from '../interfaces'
import { registerIgnoreFileCommand } from './ignoreFile'

describe('ignoreFile command', () => {
	let detector: Detector
	let configuration: Configuration
	let fileSystem: FileSystem
	let ui: UserInterface
	const context: any = { subscriptions: { push: vi.fn() } }

	beforeEach(() => {
		vi.clearAllMocks()
		detector = { checkSync: vi.fn().mockResolvedValue(undefined as any), checkSyncForFiles: vi.fn(), dispose: vi.fn() }
		const store = new Map<string, any>([['temporaryIgnore', []]])
		configuration = {
			get: (k: string, d: any) => (store.has(k) ? store.get(k) : d),
			getSection: () => configuration,
			has: (k: string) => store.has(k),
		}
		fileSystem = {
			findFiles: vi.fn(),
			readFile: vi.fn(),
			getFileStats: vi.fn(),
			asRelativePath: (p: string) => p.replace('/root/', ''),
			fileExists: vi.fn(),
		}
		ui = {
			showInformationMessage: vi.fn(),
			showWarningMessage: vi.fn(),
			showErrorMessage: vi.fn(),
			showQuickPick: vi.fn(),
			showProgress: vi.fn(),
		}
	})

	function getHandlers() {
		registerIgnoreFileCommand(context, { telemetry: { event: vi.fn() }, detector, configuration, fileSystem, ui })
		const calls = (commands.registerCommand as any).mock.calls
		const ignore = calls.find((c: any[]) => c[0] === 'envsync-le.ignoreFile')[1]
		const stop = calls.find((c: any[]) => c[0] === 'envsync-le.stopIgnoring')[1]
		const clear = calls.find((c: any[]) => c[0] === 'envsync-le.clearAllIgnored')[1]
		return { ignore, stop, clear }
	}

	it('adds a file to temporaryIgnore when not already ignored', async () => {
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		const { ignore } = getHandlers()
		;(workspace as any).workspaceFolders = [{ uri: Uri.file('/root'), name: 'ws', index: 0 }]
		const target = Uri.file('/root/.env')
		await ignore(target)
		expect(cfgObj.update).toHaveBeenCalledWith('temporaryIgnore', ['.env'], expect.anything())
		expect(detector.checkSync).toHaveBeenCalled()
		expect(ui.showInformationMessage).toHaveBeenCalled()
	})

	it('does not duplicate when already ignored', async () => {
		const store = new Map<string, any>([['temporaryIgnore', ['.env']]])
		configuration = {
			get: (k: string, d: any) => (store.has(k) ? store.get(k) : d),
			getSection: () => configuration,
			has: (k: string) => store.has(k),
		}
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		registerIgnoreFileCommand(context, { telemetry: { event: vi.fn() }, detector, configuration, fileSystem, ui })
		const { ignore } = getHandlers()
		await ignore(Uri.file('/root/.env'))
		expect(cfgObj.update).not.toHaveBeenCalled()
		expect(ui.showInformationMessage).toHaveBeenCalled()
	})

	it('warns on non-.env file', async () => {
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		const { ignore } = getHandlers()
		await ignore(Uri.file('/root/README.md'))
		expect(ui.showWarningMessage).toHaveBeenCalled()
		expect(cfgObj.update).not.toHaveBeenCalled()
	})

	it('stopIgnoring removes file and triggers check', async () => {
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		const store = new Map<string, any>([['temporaryIgnore', ['.env', '.env.local']]])
		configuration = {
			get: (k: string, d: any) => (store.has(k) ? store.get(k) : d),
			getSection: () => configuration,
			has: (k: string) => store.has(k),
		}
		registerIgnoreFileCommand(context, { telemetry: { event: vi.fn() }, detector, configuration, fileSystem, ui })
		const calls = (commands.registerCommand as any).mock.calls
		const stop = calls.find((c: any[]) => c[0] === 'envsync-le.stopIgnoring')[1]
		// Provide URI path that maps to '.env'
		await stop(Uri.file('/root/.env'))
		expect(cfgObj.update).toHaveBeenCalledWith('temporaryIgnore', ['.env.local'], expect.anything())
		expect(detector.checkSync).toHaveBeenCalled()
	})

	it('reports when no files are ignored on stopIgnoring', async () => {
		const { stop } = getHandlers()
		await stop()
		expect(ui.showInformationMessage).toHaveBeenCalled()
	})

	it('clearAllIgnored respects confirmation', async () => {
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		const store = new Map<string, any>([['temporaryIgnore', ['.env', '.env.local']]])
		configuration = {
			get: (k: string, d: any) => (store.has(k) ? store.get(k) : d),
			getSection: () => configuration,
			has: (k: string) => store.has(k),
		}
		ui.showWarningMessage = vi.fn().mockResolvedValue('No') as any
		registerIgnoreFileCommand(context, { telemetry: { event: vi.fn() }, detector, configuration, fileSystem, ui })
		const calls = (commands.registerCommand as any).mock.calls
		const clear = calls.find((c: any[]) => c[0] === 'envsync-le.clearAllIgnored')[1]
		await clear()
		expect(cfgObj.update).not.toHaveBeenCalled()

		;(ui.showWarningMessage as any).mockResolvedValue('Yes')
		await clear()
		expect(cfgObj.update).toHaveBeenCalledWith('temporaryIgnore', [], expect.anything())
		expect(detector.checkSync).toHaveBeenCalled()
	})
})
