import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commands, Uri } from 'vscode'
import type { Detector } from '../detection/detector'
import type { FileSystem, UserInterface } from '../interfaces'
import { registerCompareSelectedCommand } from './compareSelected'

describe('compareSelected command', () => {
	let detector: Detector
	let fileSystem: FileSystem
	let ui: UserInterface
	const context: any = { subscriptions: { push: vi.fn() } }

	beforeEach(() => {
		vi.clearAllMocks()
		detector = { checkSync: vi.fn(), checkSyncForFiles: vi.fn().mockResolvedValue(undefined as any), dispose: vi.fn() }
		fileSystem = {
			findFiles: vi.fn(),
			readFile: vi.fn(),
			getFileStats: vi.fn(),
			asRelativePath: (p: string) => p,
			fileExists: vi.fn(),
		}
		ui = {
			showInformationMessage: vi.fn(),
			showWarningMessage: vi.fn(),
			showErrorMessage: vi.fn(),
			showQuickPick: vi.fn(),
			showProgress: vi.fn(async (_opts, task) => await task()),
		}
	})

	function getHandler() {
		registerCompareSelectedCommand(context, { telemetry: { event: vi.fn() }, detector, fileSystem, ui })
		const handler = (commands.registerCommand as any).mock.calls.find(
			(c: any[]) => c[0] === 'envsync-le.compareSelected',
		)[1]
		return handler
	}

	it('warns when fewer than two files are selected', async () => {
		const handler = getHandler()
		await handler(Uri.file('/root/.env'))
		expect(ui.showWarningMessage).toHaveBeenCalled()
		expect(detector.checkSyncForFiles).not.toHaveBeenCalled()
	})

	it('invokes detector with two selected env files', async () => {
		const handler = getHandler()
		const a = Uri.file('/root/.env')
		const b = Uri.file('/root/.env.local')
		await handler(undefined, [a, b])
		expect(detector.checkSyncForFiles).toHaveBeenCalledWith(['/root/.env', '/root/.env.local'])
		expect(ui.showInformationMessage).toHaveBeenCalled()
	})

	it('palette flow: picks env files and runs compare', async () => {
		const handler = getHandler()
		;(fileSystem.findFiles as any).mockResolvedValue([
			{ filepath: '/root/.env', uri: 'file:///root/.env' },
			{ filepath: '/root/.env.local', uri: 'file:///root/.env.local' },
		])
		;(ui.showQuickPick as any).mockResolvedValue(['/root/.env', '/root/.env.local'])
		await handler()
		expect(detector.checkSyncForFiles).toHaveBeenCalledWith(['/root/.env', '/root/.env.local'])
	})

	it('palette flow: warns when non-env files selected reduce to <2', async () => {
		const handler = getHandler()
		;(fileSystem.findFiles as any).mockResolvedValue([
			{ filepath: '/root/.env', uri: 'file:///root/.env' },
			{ filepath: '/root/README.md', uri: 'file:///root/README.md' },
		])
		;(ui.showQuickPick as any).mockResolvedValue(['/root/.env', '/root/README.md'])
		await handler()
		expect(ui.showWarningMessage).toHaveBeenCalled()
		expect(detector.checkSyncForFiles).not.toHaveBeenCalled()
	})
})
