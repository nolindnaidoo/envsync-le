import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockExtensionContext, StatusBarAlignment, ThemeColor, window } from 'vscode'
import type { Configuration } from '../interfaces'
import { createVSCodeStatusBar } from './vscodeStatusBar'

function cfg(values: Record<string, any>): Configuration {
	return {
		get: (k: string, d: any) => (k in values ? values[k] : d),
		getSection: () =>
			({
				get: (k: string, d: any) => (k in values ? values[k] : d),
				getSection: () => ({}) as any,
				has: () => false,
			}) as any,
		has: (k: string) => k in values,
	}
}

describe('createVSCodeStatusBar', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('hides when status bar disabled in config', () => {
		const configuration = cfg({ 'statusBar.enabled': false })
		const statusBar = createVSCodeStatusBar(
			mockExtensionContext as any,
			{
				window: window as any,
				StatusBarAlignment: StatusBarAlignment as any,
				ThemeColor: ThemeColor as any,
				readConfig: (c: any) => ({ statusBarEnabled: false }) as any,
			},
			configuration,
		)
		statusBar.updateStatus('in-sync', 0)
		const item = (window.createStatusBarItem as any).mock.results[0].value
		expect(item.hide).toHaveBeenCalled()
	})

	it('shows in-sync status with file icon and 0 count, clears background', () => {
		const configuration = cfg({ 'statusBar.enabled': true })
		const statusBar = createVSCodeStatusBar(
			mockExtensionContext as any,
			{
				window: window as any,
				StatusBarAlignment: StatusBarAlignment as any,
				ThemeColor: ThemeColor as any,
				readConfig: (c: any) => ({ statusBarEnabled: true }) as any,
			},
			configuration,
		)
		statusBar.updateStatus('in-sync', 0)
		const item = (window.createStatusBarItem as any).mock.results[0].value
		expect(item.text).toContain('$(file)')
		expect(item.text).toContain('0')
		expect(item.backgroundColor).toBeUndefined()
		expect(item.show).toHaveBeenCalled()
	})

	it('shows warning state with file icon + count and sets command', () => {
		const configuration = cfg({ 'statusBar.enabled': true })
		const statusBar = createVSCodeStatusBar(
			mockExtensionContext as any,
			{
				window: window as any,
				StatusBarAlignment: StatusBarAlignment as any,
				ThemeColor: ThemeColor as any,
				readConfig: () => ({ statusBarEnabled: true }) as any,
			},
			configuration,
		)
		statusBar.updateStatus('missing-keys', 2)
		const item = (window.createStatusBarItem as any).mock.results[0].value
		expect(item.text).toContain('$(file)')
		expect(item.text).toContain('2')
		expect(item.command).toBe('envsync-le.showIssues')
		expect(item.show).toHaveBeenCalled()
	})

	it('shows error state with file icon + count and sets background color', () => {
		const configuration = cfg({ 'statusBar.enabled': true })
		const statusBar = createVSCodeStatusBar(
			mockExtensionContext as any,
			{
				window: window as any,
				StatusBarAlignment: StatusBarAlignment as any,
				ThemeColor: ThemeColor as any,
				readConfig: () => ({ statusBarEnabled: true }) as any,
			},
			configuration,
		)
		statusBar.updateStatus('parse-error', 1)
		const item = (window.createStatusBarItem as any).mock.results[0].value
		expect(item.text).toContain('$(file)')
		expect(item.command).toBe('envsync-le.showIssues')
		expect(item.backgroundColor).toBeInstanceOf(ThemeColor as any)
	})

	it('hides for no-files', () => {
		const configuration = cfg({ 'statusBar.enabled': true })
		const statusBar = createVSCodeStatusBar(
			mockExtensionContext as any,
			{
				window: window as any,
				StatusBarAlignment: StatusBarAlignment as any,
				ThemeColor: ThemeColor as any,
				readConfig: () => ({ statusBarEnabled: true }) as any,
			},
			configuration,
		)
		statusBar.updateStatus('no-files', 0)
		const item = (window.createStatusBarItem as any).mock.results[0].value
		expect(item.hide).toHaveBeenCalled()
	})

	it('dispose cleans up status bar item', () => {
		const configuration = cfg({ 'statusBar.enabled': true })
		const statusBar = createVSCodeStatusBar(
			mockExtensionContext as any,
			{
				window: window as any,
				StatusBarAlignment: StatusBarAlignment as any,
				ThemeColor: ThemeColor as any,
				readConfig: () => ({ statusBarEnabled: true }) as any,
			},
			configuration,
		)
		const item = (window.createStatusBarItem as any).mock.results[0].value
		statusBar.dispose()
		expect(item.dispose).toHaveBeenCalled()
	})

	it('uses fallback config when configuration is not provided', () => {
		const statusBar = createVSCodeStatusBar(
			mockExtensionContext as any,
			{
				window: window as any,
				StatusBarAlignment: StatusBarAlignment as any,
				ThemeColor: ThemeColor as any,
				readConfig: () => ({ statusBarEnabled: true }) as any,
			},
			undefined,
		)
		statusBar.updateStatus('in-sync', 0)
		const item = (window.createStatusBarItem as any).mock.results[0].value
		expect(item.show).toHaveBeenCalled()
	})
})
