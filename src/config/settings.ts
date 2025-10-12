import type { CommandAdapter } from '../interfaces/command';
import type { Telemetry } from '../interfaces/telemetry';

// Command to navigate users directly to envsync-le settings
export function registerOpenSettingsCommand(
	commandAdapter: CommandAdapter,
	telemetry: Telemetry,
): void {
	commandAdapter.registerCommand('envsync-le.openSettings', async () => {
		telemetry.event('command', { name: 'openSettings' });
		// Open Settings UI filtered by exact setting prefix to avoid unrelated matches
		await commandAdapter.executeCommand(
			'workbench.action.openSettings',
			'envsync-le.',
		);
	});
}
