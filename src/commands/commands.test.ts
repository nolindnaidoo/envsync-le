import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createExtensionContext,
	_getConfigUpdates,
	_registeredCommands,
	_resetMockState,
	_setConfig,
	Uri,
} from '../__mocks__/vscode';
import type { Detector } from '../detection/detector';
import type { Configuration } from '../interfaces/configuration';
import type { FileSystem } from '../interfaces/fileSystem';
import type { Notifier } from '../interfaces/notifier';
import type { UserInterface } from '../interfaces/userInterface';
import type { SyncReport } from '../types';
import { registerCompareSelectedCommand } from './compareSelected';
import { registerIgnoreFileCommand } from './ignoreFile';
import { registerSetTemplateCommand } from './setTemplate';

/**
 * The three workspace commands, which were the least-covered files here.
 *
 * Each is a chain of file discovery, a quick pick, and a comparison, and every
 * step past the first is reachable only by answering the one before it — so
 * the suite covered the no-files case and nothing else. This repo injects its
 * VS Code surface through ports (`UserInterface`, `FileSystem`, `Detector`,
 * `Configuration`), so the whole chain can be driven with fakes rather than
 * through the mock's global state.
 */

type Telemetry = { event(name: string): void; dispose(): void };

interface Harness {
	readonly info: string[];
	readonly warnings: string[];
	readonly errors: string[];
	readonly events: string[];
	readonly configWrites: Array<{ key: string; value: unknown }>;
	readonly deps: {
		telemetry: Telemetry;
		notifier: Notifier;
		detector: Detector;
		configuration: Configuration;
		fileSystem: FileSystem;
		ui: UserInterface;
	};
}

const EMPTY_REPORT: SyncReport = {
	status: 'in-sync',
	files: [],
	missingKeys: [],
	extraKeys: [],
	errors: [],
	lastChecked: 0,
};

/**
 * @param files       paths findFiles should return
 * @param pickAnswer  what the quick pick resolves to
 * @param report      what the detector reports back
 */
function harness(
	files: readonly string[] = [],
	pickAnswer: unknown = undefined,
	report: SyncReport = EMPTY_REPORT,
	configValues: Record<string, unknown> = {},
	confirmAnswer: string | undefined = 'Yes',
): Harness {
	const info: string[] = [];
	const warnings: string[] = [];
	const errors: string[] = [];
	const events: string[] = [];
	const configWrites: Array<{ key: string; value: unknown }> = [];

	const ui = {
		showProgress: async <T>(_o: unknown, task: () => Promise<T>) => task(),
		showQuickPick: async () => pickAnswer,
		showInformationMessage: (m: string) => info.push(m),
		showWarningMessage: (m: string, ...actions: string[]) => {
			warnings.push(m);
			// The overload taking actions resolves to the user's choice; the
			// plain one returns nothing. A fake that always returns undefined
			// silently takes the "declined" path for every confirmation.
			return actions.length > 0 ? Promise.resolve(confirmAnswer) : undefined;
		},
		showErrorMessage: (m: string) => errors.push(m),
		showStatusBarMessage: () => {},
	} as unknown as UserInterface;

	const fileSystem = {
		findFiles: async () => files.map((path) => ({ path, name: path })),
		readFile: async () => 'KEY=value\n',
		asRelativePath: (p: string) => p,
	} as unknown as FileSystem;

	const detector = {
		checkSync: async () => report,
		checkSyncForFiles: async () => report,
		dispose: () => {},
	} as unknown as Detector;

	const configuration = {
		get: <T>(key: string, fallback: T): T =>
			(configValues[key] as T) ?? fallback,
		has: (key: string) => key in configValues,
		update: async (key: string, value: unknown) => {
			configWrites.push({ key, value });
		},
	} as unknown as Configuration;

	return {
		info,
		warnings,
		errors,
		events,
		configWrites,
		deps: {
			telemetry: {
				event: (name: string) => events.push(name),
				dispose: () => {},
			},
			notifier: { showError: (m: string) => errors.push(m) } as never,
			detector,
			configuration,
			fileSystem,
			ui,
		},
	};
}

function makeContext() {
	return _createExtensionContext() as never;
}

async function run(id: string, ...args: unknown[]): Promise<void> {
	const handler = _registeredCommands().get(id);
	if (!handler) throw new Error(`command not registered: ${id}`);
	await handler(...args);
}

/** The command receives editor-context URIs; Uri.file mirrors the real shape. */
const uri = (path: string) => Uri.file(path);

beforeEach(() => {
	_resetMockState();
});

describe('compareSelected', () => {
	it('reports when the workspace has no .env files', async () => {
		const h = harness([]);
		registerCompareSelectedCommand(makeContext(), h.deps);
		await run('envsync-le.compareSelected');
		expect(h.info.length + h.warnings.length).toBeGreaterThan(0);
	});

	it('asks for at least two files when only one is selected', async () => {
		// Passing a single uri exercises the direct-selection branch as well as
		// the minimum-count guard.
		const h = harness([]);
		registerCompareSelectedCommand(makeContext(), h.deps);
		await run('envsync-le.compareSelected', uri('/w/.env'));
		expect(h.warnings.length).toBeGreaterThan(0);
	});

	it('compares a multi-selection passed from the explorer', async () => {
		const h = harness([]);
		registerCompareSelectedCommand(makeContext(), h.deps);
		await run('envsync-le.compareSelected', undefined, [
			uri('/w/.env'),
			uri('/w/.env.example'),
		]);
		expect(h.info.length + h.warnings.length).toBeGreaterThan(0);
	});

	it('warns when the selection holds no .env files', async () => {
		const h = harness([]);
		registerCompareSelectedCommand(makeContext(), h.deps);
		await run('envsync-le.compareSelected', undefined, [
			uri('/w/readme.md'),
			uri('/w/index.ts'),
		]);
		expect(h.warnings.length).toBeGreaterThan(0);
	});

	it('does nothing when the file picker is dismissed', async () => {
		const h = harness(['/w/.env', '/w/.env.example'], undefined);
		registerCompareSelectedCommand(makeContext(), h.deps);
		await run('envsync-le.compareSelected');
		expect(h.info).toHaveLength(0);
	});

	it('warns when fewer than two files are picked', async () => {
		const h = harness(['/w/.env', '/w/.env.example'], ['/w/.env']);
		registerCompareSelectedCommand(makeContext(), h.deps);
		await run('envsync-le.compareSelected');
		expect(h.warnings.length).toBeGreaterThan(0);
	});

	it('reports files that are in sync', async () => {
		const h = harness(
			['/w/.env', '/w/.env.example'],
			['/w/.env', '/w/.env.example'],
			{ ...EMPTY_REPORT, status: 'in-sync' },
		);
		registerCompareSelectedCommand(makeContext(), h.deps);
		await run('envsync-le.compareSelected');
		expect(h.info.length).toBeGreaterThan(0);
	});

	it('reports files that are out of sync', async () => {
		const h = harness(
			['/w/.env', '/w/.env.example'],
			['/w/.env', '/w/.env.example'],
			{
				...EMPTY_REPORT,
				status: 'missing-keys',
				missingKeys: [
					{
						filepath: '/w/.env',
						keys: ['API_KEY'],
						reference: '/w/.env.example',
					},
				],
			},
		);
		registerCompareSelectedCommand(makeContext(), h.deps);
		await run('envsync-le.compareSelected');
		expect(h.warnings.length + h.info.length).toBeGreaterThan(0);
	});

	it('reports files that could not be parsed', async () => {
		const h = harness(
			['/w/.env', '/w/.env.example'],
			['/w/.env', '/w/.env.example'],
			{
				...EMPTY_REPORT,
				status: 'parse-error',
				errors: [{ type: 'parse-error', filepath: '/w/.env', message: 'bad' }],
			},
		);
		registerCompareSelectedCommand(makeContext(), h.deps);
		await run('envsync-le.compareSelected');
		expect(h.errors.length + h.warnings.length).toBeGreaterThan(0);
	});
});

describe('setTemplate', () => {
	it('reports when the workspace has no .env files', async () => {
		const h = harness([]);
		registerSetTemplateCommand(makeContext(), h.deps);
		await run('envsync-le.setTemplate');
		expect(h.info.length + h.warnings.length).toBeGreaterThan(0);
	});

	it('does nothing when the picker is dismissed', async () => {
		const h = harness(['/w/.env'], undefined);
		registerSetTemplateCommand(makeContext(), h.deps);
		await run('envsync-le.setTemplate');
		expect(_getConfigUpdates()).toHaveLength(0);
	});

	it('writes the chosen file as the template', async () => {
		const h = harness(['/w/.env.example'], '/w/.env.example');
		registerSetTemplateCommand(makeContext(), h.deps);
		await run('envsync-le.setTemplate');
		expect(_getConfigUpdates().length).toBeGreaterThan(0);
	});

	it('clears the template', async () => {
		const h = harness([]);
		registerSetTemplateCommand(makeContext(), h.deps);
		await run('envsync-le.clearTemplate');
		expect(_getConfigUpdates().length + h.info.length).toBeGreaterThan(0);
	});
});

describe('ignoreFile', () => {
	it('reports when the workspace has no .env files', async () => {
		const h = harness([]);
		registerIgnoreFileCommand(makeContext(), h.deps);
		await run('envsync-le.ignoreFile');
		expect(h.info.length + h.warnings.length).toBeGreaterThan(0);
	});

	it('does nothing when the picker is dismissed', async () => {
		const h = harness(['/w/.env'], undefined);
		registerIgnoreFileCommand(makeContext(), h.deps);
		await run('envsync-le.ignoreFile');
		expect(_getConfigUpdates()).toHaveLength(0);
	});

	it('adds the chosen file to the ignore list', async () => {
		const h = harness(['/w/.env.local'], '/w/.env.local');
		registerIgnoreFileCommand(makeContext(), h.deps);
		await run('envsync-le.ignoreFile');
		expect(_getConfigUpdates().length).toBeGreaterThan(0);
	});

	it('reports an empty ignore list', async () => {
		const h = harness([], undefined, EMPTY_REPORT, { temporaryIgnore: [] });
		registerIgnoreFileCommand(makeContext(), h.deps);
		await run('envsync-le.clearAllIgnored');
		expect(h.info.length).toBeGreaterThan(0);
	});

	it('clears a populated ignore list', async () => {
		_setConfig('envsync-le.temporaryIgnore', ['/w/.env.local']);
		const h = harness([], undefined, EMPTY_REPORT, {
			temporaryIgnore: ['/w/.env.local'],
		});
		registerIgnoreFileCommand(makeContext(), h.deps);
		await run('envsync-le.clearAllIgnored');
		expect(_getConfigUpdates().length).toBeGreaterThan(0);
	});

	it('leaves the ignore list alone when the confirmation is declined', async () => {
		_setConfig('envsync-le.temporaryIgnore', ['/w/.env.local']);
		const h = harness(
			[],
			undefined,
			EMPTY_REPORT,
			{ temporaryIgnore: ['/w/.env.local'] },
			'No',
		);
		registerIgnoreFileCommand(makeContext(), h.deps);
		await run('envsync-le.clearAllIgnored');
		expect(_getConfigUpdates()).toHaveLength(0);
	});
});
