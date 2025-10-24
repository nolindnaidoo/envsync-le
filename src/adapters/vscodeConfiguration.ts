import type { WorkspaceConfiguration } from 'vscode';
import type { Configuration } from '../interfaces';

interface MinimalWorkspace {
	getConfiguration(section: string): WorkspaceConfiguration;
}

export function createVSCodeConfiguration(
	workspace: MinimalWorkspace,
): Configuration {
	const config = workspace.getConfiguration('envsync-le');

	return {
		get<T>(key: string, defaultValue: T): T {
			return config.get(key, defaultValue);
		},

		getSection(section: string): Configuration {
			const sectionConfig = config.get(section) as
				| Record<string, unknown>
				| undefined;
			return {
				get<T>(key: string, defaultValue: T): T {
					return (sectionConfig?.[key] as T) ?? defaultValue;
				},
				getSection(): Configuration {
					return this;
				},
				has(): boolean {
					return false;
				},
			};
		},

		has(key: string): boolean {
			return config.has(key);
		},
	};
}
