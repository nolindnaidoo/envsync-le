import { beforeEach, describe, expect, it, vi } from 'vitest'
import { window } from 'vscode'
import type { Configuration } from '../interfaces'
import { createVSCodeTelemetry } from './vscodeTelemetry'

function makeConfig(enabled: boolean): Configuration {
	return {
		get: (k: string, d: any) => (k === 'telemetryEnabled' ? enabled : d),
		getSection: () =>
			({
				get: (k: string, d: any) => (k === 'telemetryEnabled' ? enabled : d),
				getSection: () => ({}) as any,
				has: () => false,
			}) as any,
		has: () => false,
	}
}

describe('createVSCodeTelemetry', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('does not log when telemetry is disabled', () => {
		const telemetry = createVSCodeTelemetry(makeConfig(false))
		telemetry.event('test', { a: '1' })
		const channel = (window.createOutputChannel as any).mock.results[0]
		expect(channel).toBeUndefined()
	})

	it('logs to output channel when telemetry is enabled', () => {
		const telemetry = createVSCodeTelemetry(makeConfig(true))
		telemetry.event('test', { a: '1' })
		const channel = (window.createOutputChannel as any).mock.results[0].value
		expect(channel.appendLine).toHaveBeenCalledWith(expect.stringContaining('test'))
	})
})
