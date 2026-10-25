/**
 * The command line, parsed as the Rust CLI parses it: strictly, in order, and
 * refusing rather than defaulting. A typo'd `--tempate` that quietly did
 * nothing would compare against the union and report a clean tree that was
 * never checked against its contract.
 */
import { DEFAULT_SCAN, type ScanOptions } from './scan';
import { FLAGS } from './usage';

export interface Cli {
	readonly root: string;
	readonly files: readonly string[];
	readonly scan: ScanOptions;
	readonly strict: boolean;
}

type Draft = { -readonly [K in keyof Cli]: Cli[K] };

export function parse(args: readonly string[]): Cli {
	const draft: Draft = {
		root: '.',
		files: [],
		scan: DEFAULT_SCAN,
		strict: false,
	};
	const roots: string[] = [];

	for (let index = 0; index < args.length; index++) {
		const arg = args[index] as string;
		if (arg.startsWith('-') && !FLAGS.includes(arg)) {
			throw new Error(`${arg} is not an option. Try --help.`);
		}
		const takes = VALUED.get(arg);
		if (takes) {
			const value = args[++index];
			if (value === undefined) throw new Error(`${arg} needs ${takes.needs}`);
			takes.apply(draft, value);
			continue;
		}
		const toggle = SWITCHES.get(arg);
		if (toggle) {
			toggle(draft);
			continue;
		}
		roots.push(arg);
	}

	if (roots.length > 1) {
		throw new Error(
			'name one directory, not several. Try --file to pick files.',
		);
	}
	if (draft.files.length > 0 && roots.length > 0) {
		throw new Error('--file and a directory are two different questions');
	}
	if (roots[0] !== undefined) draft.root = roots[0];
	return Object.freeze(draft);
}

// Maps, not object literals: an argument is the caller's text, and a plain
// object answers `constructor`, `toString` and `__proto__` with a function,
// so `envsync-le constructor` was read as an option with no value where the
// crate walks the directory and names it missing.
const SWITCHES: ReadonlyMap<string, (draft: Draft) => void> = new Map([
	[
		'--ignore-case',
		(draft) => {
			draft.scan = { ...draft.scan, ignoreCase: true };
		},
	],
	[
		'--strict',
		(draft) => {
			draft.strict = true;
		},
	],
	[
		'--hidden',
		(draft) => {
			draft.scan = {
				...draft.scan,
				discover: { ...draft.scan.discover, hidden: true },
			};
		},
	],
	[
		'--no-ignore',
		(draft) => {
			draft.scan = {
				...draft.scan,
				discover: { ...draft.scan.discover, respectIgnore: false },
			};
		},
	],
]);

interface Valued {
	readonly needs: string;
	readonly apply: (draft: Draft, value: string) => void;
}

const VALUED: ReadonlyMap<string, Valued> = new Map([
	[
		'--template',
		{
			needs: 'a path',
			apply: (draft, value) => {
				draft.scan = { ...draft.scan, template: value };
			},
		},
	],
	[
		'--exclude',
		{
			needs: 'a pattern',
			apply: (draft, value) => {
				const exclude = [...draft.scan.discover.exclude, value];
				draft.scan = {
					...draft.scan,
					discover: { ...draft.scan.discover, exclude },
				};
			},
		},
	],
	[
		'--file',
		{
			needs: 'a path',
			apply: (draft, value) => {
				draft.files = [...draft.files, value];
			},
		},
	],
]);
