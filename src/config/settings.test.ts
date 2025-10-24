import { describe, expect, it, vi } from 'vitest';
import type { CommandAdapter } from '../interfaces/command';
import type { Telemetry } from '../interfaces/telemetry';
import { registerOpenSettingsCommand } from './settings';

describe('registerOpenSettingsCommand', () => {
	it('should register the open settings command and execute it correctly', async () => {
		const mockCommandAdapter: CommandAdapter = {
			registerCommand: vi.fn(),
			executeCommand: vi.fn(async () => Promise.resolve()),
		};
		const mockTelemetry: Telemetry = {
			event: vi.fn(),
			dispose: vi.fn(),
		};

		registerOpenSettingsCommand(mockCommandAdapter, mockTelemetry);

		// Expect registerCommand to have been called once
		expect(mockCommandAdapter.registerCommand).toHaveBeenCalledTimes(1);
		expect(mockCommandAdapter.registerCommand).toHaveBeenCalledWith(
			'envsync-le.openSettings',
			expect.any(Function),
		);

		// Get the callback function that was registered
		const registeredCallback = (mockCommandAdapter.registerCommand as vi.Mock)
			.mock.calls[0][1];

		// Execute the callback
		await registeredCallback();

		// Expect telemetry event to have been called
		expect(mockTelemetry.event).toHaveBeenCalledTimes(1);
		expect(mockTelemetry.event).toHaveBeenCalledWith('command', {
			name: 'openSettings',
		});

		// Expect executeCommand to have been called with extension filter
		expect(mockCommandAdapter.executeCommand).toHaveBeenCalledTimes(1);
		expect(mockCommandAdapter.executeCommand).toHaveBeenCalledWith(
			'workbench.action.openSettings',
			'envsync-le.',
		);
	});
});
