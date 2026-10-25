import type { WorkspaceConfiguration } from 'vscode';
import type { Configuration } from '../interfaces';

interface MinimalWorkspace {
	getConfiguration(section: string): WorkspaceConfiguration;
}

/**
 * Read on every call, never held.
 *
 * `getConfiguration()` returns the values of the moment it was called, and a
 * change made afterwards does not reach that object. The adapter once asked
 * for it at activation and read from it for the life of the session, so no
 * setting took effect without a reload, and a command that read the ignore
 * list it had just written read the list from activation instead.
 */
export function createVSCodeConfiguration(
	workspace: MinimalWorkspace,
): Configuration {
	const current = (): WorkspaceConfiguration =>
		workspace.getConfiguration('envsync-le');

	return {
		get<T>(key: string, defaultValue: T): T {
			return current().get(key, defaultValue);
		},

		has(key: string): boolean {
			return current().has(key);
		},
	};
}
