import {
	mkdirSync,
	mkdtempSync,
	rmdirSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from './args';
import { CHECK_TOOL } from './checkTool';
import { discover, display, forwardSlashes, relativePath } from './discover';
import { rustIoMessage } from './ioError';
import { run } from './run';
import { DEFAULT_SCAN, exitCode, scan, scanPaths } from './scan';
import { FLAGS, USAGE } from './usage';

const files: string[] = [];
const dirs: string[] = [];

function tree(layout: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), 'envsync-le-cli-'));
	dirs.push(root);
	for (const [relative, content] of Object.entries(layout)) {
		const parts = relative.split('/');
		for (let depth = 1; depth < parts.length; depth++) {
			const dir = join(root, ...parts.slice(0, depth));
			if (dirs.includes(dir)) continue;
			mkdirSync(dir);
			dirs.push(dir);
		}
		writeFileSync(join(root, relative), content);
		files.push(join(root, relative));
	}
	return root;
}

afterEach(() => {
	for (const file of files.splice(0)) unlinkSync(file);
	for (const dir of dirs.splice(0).reverse()) rmdirSync(dir);
});

function capture(args: readonly string[], terminal = false) {
	let stdout = '';
	let stderr = '';
	const code = run(args, {
		stdout: (text) => {
			stdout += text;
		},
		stderr: (text) => {
			stderr += text;
		},
		stdoutIsTerminal: terminal,
		version: '9.9.9',
	});
	return { code, stdout, stderr };
}

describe('usage', () => {
	it('names every flag the parser accepts, and no other', () => {
		const named = new Set(
			USAGE.split(/\s+/)
				.filter((word) => word.startsWith('--'))
				.map((word) => word.replace(/[,.:;]+$/, ''))
				.filter((word) => word !== '--version' && word !== '--help'),
		);
		expect([...named].sort()).toEqual([...FLAGS].sort());
	});

	it('offers nothing that reads a value', () => {
		for (const word of ['value', 'secret', 'fix'])
			expect(USAGE).not.toContain(word);
	});
});

describe('parse', () => {
	it('refuses an unknown flag rather than ignoring it', () => {
		expect(() => parse(['--tempate', 'x'])).toThrow(
			'--tempate is not an option',
		);
		for (const attempt of ['--values', '--show-values', '--fix', '--write'])
			expect(() => parse([attempt])).toThrow('is not an option');
	});

	it('refuses a flag with no value', () => {
		expect(() => parse(['--template'])).toThrow('--template needs a path');
		expect(() => parse(['--exclude'])).toThrow('--exclude needs a pattern');
		expect(() => parse(['--file'])).toThrow('--file needs a path');
	});

	it('takes one directory, defaulting to the working one', () => {
		expect(parse([]).root).toBe('.');
		expect(parse(['src']).root).toBe('src');
		expect(() => parse(['a', 'b'])).toThrow('name one directory');
		expect(() => parse(['--file', 'a', 'dir'])).toThrow(
			'--file and a directory',
		);
	});

	it('repeats --exclude and leaves the ignore rules off', () => {
		const options = parse(['--exclude', 'a', '--exclude', 'b']);
		expect(options.scan.discover.exclude).toEqual(['a', 'b']);
		expect(options.scan.discover.respectIgnore).toBe(false);
	});
});

describe('discover', () => {
	it('finds dotfiles without asking, and skips hidden directories', () => {
		const root = tree({
			'.env': 'A=1',
			'.env.example': 'A=',
			'README.md': 'A=1',
			'.hidden/.env.test': 'A=1',
		});
		const names = discover(root, DEFAULT_SCAN.discover).map((path) =>
			relativePath(path, root),
		);
		expect(names).toEqual(['.env', '.env.example']);
		const all = discover(root, { ...DEFAULT_SCAN.discover, hidden: true });
		expect(all).toHaveLength(3);
	});

	/** The shape of nearly every repository: `.env.example` committed, `.env` ignored. */
	it('compares an ignored dotenv unless the ignore rules are asked for', () => {
		const root = tree({
			'.git/HEAD': '',
			'.gitignore': '.env\n',
			'.env': 'A=1',
			'.env.example': 'A=',
		});
		expect(discover(root, DEFAULT_SCAN.discover)).toHaveLength(2);
		expect(
			discover(root, { ...DEFAULT_SCAN.discover, respectIgnore: true }),
		).toHaveLength(1);
	});

	it('sorts by component, as Rust sorts a PathBuf', () => {
		const root = tree({ 'a.b/.env': 'A=1', 'a/.env': 'A=1', '.env': 'A=1' });
		const names = discover(root, DEFAULT_SCAN.discover).map((path) =>
			relativePath(path, root),
		);
		expect(names).toEqual(['.env', 'a/.env', 'a.b/.env']);
	});

	it('lets a pattern that does not compile exclude nothing', () => {
		const root = tree({ '.env': 'A=1', '.env.local': 'A=1' });
		const options = { ...DEFAULT_SCAN.discover, exclude: ['[z-a]', '*.local'] };
		expect(discover(root, options)).toHaveLength(1);
	});

	it('names a missing root', () => {
		expect(() => discover('no/such/dir', DEFAULT_SCAN.discover)).toThrow(
			process.platform === 'win32'
				? 'no/such/dir: The system cannot find the path specified. (os error 3)'
				: 'no/such/dir: No such file or directory (os error 2)',
		);
	});
});

describe('paths', () => {
	it('strips the root as Path::strip_prefix does', () => {
		expect(relativePath('./a/.env', '.')).toBe('a/.env');
		expect(relativePath('a/.env', '.')).toBe('a/.env');
		expect(relativePath('dir//sub/.env', 'dir/')).toBe('sub/.env');
		expect(relativePath('.env', '.env')).toBe('');
	});

	it('spells a Windows path with forward slashes', () => {
		expect(forwardSlashes('C:\\src\\.env')).toBe('C:/src/.env');
		expect(forwardSlashes('\\\\?\\C:\\src\\.env')).toBe('C:/src/.env');
		expect(forwardSlashes('\\\\?\\UNC\\server\\share\\.env')).toBe(
			'//server/share/.env',
		);
	});
});

describe('scan', () => {
	it('matches a template by the name it ends in', () => {
		const root = tree({ '.env.example': 'A=\n', '.env': 'A=1\nLOCAL=2\n' });
		for (const template of [
			'.env.example',
			'./.env.example',
			`${root}/.env.example`,
		]) {
			const report = scan(root, { ...DEFAULT_SCAN, template });
			expect(report.extraKeys, template).toEqual([
				{ filepath: '.env', keys: ['LOCAL'], reference: '.env.example' },
			]);
		}
	});

	it('names a file given as the root the way --file names it', () => {
		const root = tree({ '.env.production': 'A=1' });
		const file = join(root, '.env.production');
		const report = scan(file, DEFAULT_SCAN);
		expect(report.files).toEqual([
			{ path: display(file), type: 'production', keys: 1 },
		]);
	});

	it('falls back to the union for a template that is not there', () => {
		const root = tree({ '.env.example': 'A=\n', '.env': 'A=1\nLOCAL=2\n' });
		const report = scan(root, { ...DEFAULT_SCAN, template: 'nowhere' });
		expect(report.mode).toBe('template');
		expect(report.extraKeys).toEqual([]);
		expect(report.status).toBe('missing-keys');
	});

	it('names a file it could not read and compares the rest', () => {
		const root = tree({ '.env': 'A=1', '.env.bin': '' });
		writeFileSync(join(root, '.env.bin'), Buffer.from([0x41, 0x3d, 0xe9]));
		const report = scanPaths(
			[join(root, '.env'), join(root, '.env.bin'), join(root, 'gone')],
			root,
			DEFAULT_SCAN,
		);
		expect(report.diagnostics.map((found) => found.message)).toEqual([
			'not UTF-8 text',
			process.platform === 'win32'
				? 'The system cannot find the file specified. (os error 2)'
				: 'No such file or directory (os error 2)',
		]);
		expect(exitCode(report, false)).toBe(0);
		expect(exitCode(report, true)).toBe(2);
	});

	it('carries no value into the report', () => {
		const root = tree({
			'.env': 'SECRET=hunter2\nURL=postgres://x\n2BAD=leak',
		});
		const rendered = JSON.stringify(scan(root, DEFAULT_SCAN));
		for (const value of ['hunter2', 'postgres', 'leak'])
			expect(rendered).not.toContain(value);
	});
});

describe('run', () => {
	it('writes one report to a pipe and the verdict to stderr', () => {
		const root = tree({ '.env': 'A=1\nB=2', '.env.production': 'A=1' });
		const { code, stdout, stderr } = capture([root]);
		expect(code).toBe(1);
		expect(stdout.split('\n')).toHaveLength(2);
		expect(JSON.parse(stdout).summary).toEqual({
			files: 2,
			missing: 1,
			extra: 0,
		});
		expect(stderr).toBe(
			'.env.production: missing B (in .env)\n' +
				'out of sync — 1 file with mismatches across 2 files\n',
		);
	});

	it('writes nothing to stdout at a terminal', () => {
		const root = tree({ '.env': 'A=1' });
		const { code, stdout, stderr } = capture([root], true);
		expect(code).toBe(0);
		expect(stdout).toBe('');
		expect(stderr).toBe('in sync — 1 file\n');
	});

	it('answers 0 for a tree with no dotenv files', () => {
		const root = tree({ 'notes.txt': 'A=1' });
		expect(capture([root]).stderr).toBe('no dotenv files found\n');
		expect(capture([root]).code).toBe(0);
	});

	it('refuses a malformed question with 2', () => {
		expect(capture(['--nope'])).toEqual({
			code: 2,
			stdout: '',
			stderr: 'envsync-le: --nope is not an option. Try --help.\n',
		});
		expect(capture(['--version']).stdout).toBe('envsync-le 9.9.9\n');
	});
});

describe('envsync_le_check', () => {
	it('returns the report in the envelope, with diagnostics naming the file', async () => {
		const root = tree({ '.env': 'A=1\n2BAD=x', '.env.production': 'A=1' });
		const result = (await CHECK_TOOL.handler({
			path: root,
			ignored: true,
		})) as {
			ok: boolean;
			data: { status: string };
			diagnostics: { code: string; message: string }[];
			meta: { count: number };
		};
		expect(result.ok).toBe(true);
		expect(result.data.status).toBe('in-sync');
		expect(result.meta.count).toBe(2);
		expect(result.diagnostics).toEqual([
			{
				severity: 'warning',
				code: 'parse-error',
				message: '.env: Line 2: Invalid key format',
			},
		]);
	});

	it('compares a git-ignored dotenv whatever `ignored` says', async () => {
		const root = tree({
			'.git/HEAD': '',
			'.gitignore': '.env\n',
			'.env.example': 'A=\nB=',
			'.env': 'A=1',
		});
		for (const ignored of [undefined, false, true]) {
			const result = (await CHECK_TOOL.handler({ path: root, ignored })) as {
				data: { status: string; summary: { files: number } };
			};
			expect(result.data.summary.files, String(ignored)).toBe(2);
			expect(result.data.status, String(ignored)).toBe('missing-keys');
		}
	});

	it('refuses a call with no directory', async () => {
		await expect(CHECK_TOOL.handler({})).rejects.toThrow(
			'no directory was supplied to compare',
		);
	});
});

describe('rustIoMessage', () => {
	const failure = (code: string, errno: number, path?: string) =>
		Object.assign(new Error(`${code}: failed`), { code, errno, path });

	it('words an error as Rust does on each platform', () => {
		expect(rustIoMessage(failure('ENOENT', -2), 'darwin')).toBe(
			'No such file or directory (os error 2)',
		);
		expect(rustIoMessage(failure('EBUSY', -16), 'darwin')).toBe(
			'Resource busy (os error 16)',
		);
		expect(rustIoMessage(failure('EBUSY', -16), 'linux')).toBe(
			'Device or resource busy (os error 16)',
		);
		expect(rustIoMessage(failure('EPERM', -4048), 'win32')).toBe(
			'Access is denied. (os error 5)',
		);
	});

	/** libuv folds both Windows codes into ENOENT, numbered -4058. */
	it('tells a missing file from a missing directory on Windows', () => {
		const root = tree({ '.env': 'A=1' });
		expect(
			rustIoMessage(failure('ENOENT', -4058, join(root, 'gone')), 'win32'),
		).toBe('The system cannot find the file specified. (os error 2)');
		expect(
			rustIoMessage(
				failure('ENOENT', -4058, join(root, 'no', 'gone')),
				'win32',
			),
		).toBe('The system cannot find the path specified. (os error 3)');
		expect(
			rustIoMessage(
				failure('ENOENT', -4058, join(root, '.env', 'gone')),
				'win32',
			),
		).toBe('The system cannot find the path specified. (os error 3)');
	});
});
