import { beforeEach, describe, expect, it, vi } from 'vitest'
import { window } from 'vscode'
import type { Config } from '../interfaces/configuration'
import type { Notifier } from '../interfaces/notifier'
import { createVSCodeNotifier } from './vscodeNotifier'

describe('createVSCodeNotifier', () => {
	let notifier: Notifier
	let mockReadConfig: () => Config

	beforeEach(() => {
		vi.clearAllMocks()
	})

	const setupNotifier = (level: Config['notificationLevel']) => {
		mockReadConfig = () => ({ notificationLevel: level }) as Config
		notifier = createVSCodeNotifier({
			window: window,
			readConfig: mockReadConfig,
		})
	}

	describe('showMissingKeys', () => {
		it('should show a warning message if level is all', () => {
			setupNotifier('all')
			notifier.showMissingKeys('/path/to/.env', ['KEY1', 'KEY2'])
			expect(window.showWarningMessage).toHaveBeenCalledWith('Missing keys in .env: KEY1, KEY2')
		})

		it('should show a warning message if level is important', () => {
			setupNotifier('important')
			notifier.showMissingKeys('/path/to/.env', ['KEY1', 'KEY2'])
			expect(window.showWarningMessage).toHaveBeenCalledWith('Missing keys in .env: KEY1, KEY2')
		})

		it('should not show a warning message if level is silent', () => {
			setupNotifier('silent')
			notifier.showMissingKeys('/path/to/.env', ['KEY1', 'KEY2'])
			expect(window.showWarningMessage).not.toHaveBeenCalled()
		})

		it('should truncate key list if more than 3 keys', () => {
			setupNotifier('all')
			notifier.showMissingKeys('/path/to/.env', ['KEY1', 'KEY2', 'KEY3', 'KEY4'])
			expect(window.showWarningMessage).toHaveBeenCalledWith('Missing keys in .env: KEY1, KEY2, KEY3...')
		})
	})

	describe('showExtraKeys', () => {
		it('should show an information message if level is all', () => {
			setupNotifier('all')
			notifier.showExtraKeys('/path/to/.env', ['KEY1', 'KEY2'])
			expect(window.showInformationMessage).toHaveBeenCalledWith('Extra keys in .env: KEY1, KEY2')
		})

		it('should not show an information message if level is important', () => {
			setupNotifier('important')
			notifier.showExtraKeys('/path/to/.env', ['KEY1', 'KEY2'])
			expect(window.showInformationMessage).not.toHaveBeenCalled()
		})

		it('should not show an information message if level is silent', () => {
			setupNotifier('silent')
			notifier.showExtraKeys('/path/to/.env', ['KEY1', 'KEY2'])
			expect(window.showInformationMessage).not.toHaveBeenCalled()
		})
	})

	describe('showError', () => {
		it('should show an error message if level is all', () => {
			setupNotifier('all')
			notifier.showError('Test Error')
			expect(window.showErrorMessage).toHaveBeenCalledWith('Test Error')
		})

		it('should show an error message if level is important', () => {
			setupNotifier('important')
			notifier.showError('Test Error')
			expect(window.showErrorMessage).toHaveBeenCalledWith('Test Error')
		})

		it('should not show an error message if level is silent', () => {
			setupNotifier('silent')
			notifier.showError('Test Error')
			expect(window.showErrorMessage).not.toHaveBeenCalled()
		})
	})

	describe('showParseError', () => {
		it('should show an error message if level is all', () => {
			setupNotifier('all')
			notifier.showParseError('/path/to/.env', 'Parse Error')
			expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to parse .env: Parse Error')
		})

		it('should show an error message if level is important', () => {
			setupNotifier('important')
			notifier.showParseError('/path/to/.env', 'Parse Error')
			expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to parse .env: Parse Error')
		})

		it('should not show an error message if level is silent', () => {
			setupNotifier('silent')
			notifier.showParseError('/path/to/.env', 'Parse Error')
			expect(window.showErrorMessage).not.toHaveBeenCalled()
		})
	})
})
