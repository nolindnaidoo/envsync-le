import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commands, Uri, workspace } from 'vscode'
import type { Detector } from '../detection/detector'
import type { Configuration, FileSystem, UserInterface } from '../interfaces'
import { registerSetTemplateCommand } from './setTemplate'

describe('setTemplate command', () => {
	let detector: Detector
	let configuration: Configuration
	let fileSystem: FileSystem
	let ui: UserInterface
	const context: any = { subscriptions: { push: vi.fn() } }

	beforeEach(() => {
		vi.clearAllMocks()
		detector = { checkSync: vi.fn().mockResolvedValue(undefined as any), checkSyncForFiles: vi.fn(), dispose: vi.fn() }
		configuration = {
			get: vi.fn(),
			getSection: () => configuration,
			has: vi.fn(),
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
		registerSetTemplateCommand(context, { telemetry: { event: vi.fn() }, detector, configuration, fileSystem, ui })
		const calls = (commands.registerCommand as any).mock.calls
		const set = calls.find((c: any[]) => c[0] === 'envsync-le.setTemplate')[1]
		const clear = calls.find((c: any[]) => c[0] === 'envsync-le.clearTemplate')[1]
		return { set, clear }
	}

	it('sets template and comparison mode', async () => {
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		const { set } = getHandlers()
		await set(Uri.file('/root/.env'))
		expect(cfgObj.update).toHaveBeenCalledWith('templateFile', '.env', expect.anything())
		expect(cfgObj.update).toHaveBeenCalledWith('comparisonMode', 'template', expect.anything())
		expect(detector.checkSync).toHaveBeenCalled()
		expect(ui.showInformationMessage).toHaveBeenCalled()
	})

	it('clears template and returns to auto', async () => {
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		const { clear } = getHandlers()
		await clear()
		expect(cfgObj.update).toHaveBeenCalledWith('templateFile', undefined, expect.anything())
		expect(cfgObj.update).toHaveBeenCalledWith('comparisonMode', 'auto', expect.anything())
	})

	it('palette flow: picks env file and sets template', async () => {
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		;(fileSystem.findFiles as any).mockResolvedValue([
			{ filepath: '/root/.env', uri: 'file:///root/.env' },
			{ filepath: '/root/.env.local', uri: 'file:///root/.env.local' },
		])
		;(ui.showQuickPick as any).mockResolvedValue('/root/.env')
		const { set } = getHandlers()
		await set()
		expect(cfgObj.update).toHaveBeenCalledWith('templateFile', '.env', expect.anything())
		expect(cfgObj.update).toHaveBeenCalledWith('comparisonMode', 'template', expect.anything())
		expect(detector.checkSync).toHaveBeenCalled()
	})

	it('palette flow: warns on non-.env selection', async () => {
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		;(fileSystem.findFiles as any).mockResolvedValue([{ filepath: '/root/README.md', uri: 'file:///root/README.md' }])
		;(ui.showQuickPick as any).mockResolvedValue('/root/README.md')
		const { set } = getHandlers()
		await set()
		expect(ui.showWarningMessage).toHaveBeenCalled()
		expect(cfgObj.update).not.toHaveBeenCalled()
	})

	it('palette flow: shows info when no env files found', async () => {
		const { set } = getHandlers()
		;(fileSystem.findFiles as any).mockResolvedValue([])
		await set()
		expect(ui.showInformationMessage).toHaveBeenCalled()
	})

	it('palette flow: user cancels selection', async () => {
		const { set } = getHandlers()
		;(fileSystem.findFiles as any).mockResolvedValue([{ filepath: '/root/.env', uri: 'file:///root/.env' }])
		;(ui.showQuickPick as any).mockResolvedValue(undefined)
		await set()
		expect(detector.checkSync).not.toHaveBeenCalled()
		expect(workspace.getConfiguration).not.toHaveBeenCalledWith('envsync-le')
	})

	it('warns when provided URI is not an .env file', async () => {
		const cfgObj = { get: vi.fn(), update: vi.fn() }
		;(workspace.getConfiguration as any).mockReturnValue(cfgObj)
		const { set } = getHandlers()
		await set(Uri.file('/root/README.md'))
		expect(ui.showWarningMessage).toHaveBeenCalled()
		expect(cfgObj.update).not.toHaveBeenCalled()
	})
})
