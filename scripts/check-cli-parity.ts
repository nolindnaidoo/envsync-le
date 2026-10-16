/**
 * Requires the npm command line to behave exactly as the Rust one does.
 *
 * Both install a command named `envsync-le`, so a person or a CI step cannot
 * tell which one they have. This is a different contract from
 * `check-detection-parity.ts`, which holds the extension's engine equal to
 * the crate's: here the whole terminal surface is compared, the walk, the
 * template matching, the exit codes, stdout and stderr byte for byte, and the
 * two tools `envsync-le mcp` serves. Nothing is exempt.
 *
 * Every case runs both binaries over one generated tree with stdout piped,
 * which is how a script sees them. `--version` is compared too: every surface
 * carries one version, and two binaries of one name disagreeing about it is
 * the first thing a person comparing them would see.
 *
 * Run: bun run build:cli && cargo build --locked --manifest-path crate/Cargo.toml
 *      bun scripts/check-cli-parity.ts
 */
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmdirSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const RUST =
	process.env.ENVSYNC_LE_BIN ??
	join(ROOT, 'crate', 'target', 'debug', `envsync-le${process.platform === 'win32' ? '.exe' : ''}`);
const NODE_CLI = join(ROOT, 'cli', 'cli.js');
/**
 * Node, by name, not `process.execPath`: this script runs under Bun, and the
 * package is run by Node wherever `npx` runs it. Bun's errors are not Node's.
 */
const NODE = process.env.NODE_BIN ?? 'node';

interface Case {
	readonly args: readonly string[];
	/** Relative to the tree. The tree itself when absent. */
	readonly cwd?: string;
}

interface Outcome {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

for (const [label, path] of [
	['the Rust binary', RUST],
	['cli/cli.js', NODE_CLI],
] as const) {
	if (!existsSync(path)) {
		console.error(`FAIL: ${label} is missing at ${path}. Build it first.`);
		process.exit(1);
	}
}

const tree = mkdtempSync(join(tmpdir(), 'envsync-le-cli-parity-'));
const created: string[] = [];
const dirs: string[] = [tree];

function dir(relative: string): void {
	mkdirSync(join(tree, relative));
	dirs.push(join(tree, relative));
}

function file(relative: string, content: string | Buffer): void {
	writeFileSync(join(tree, relative), content);
	created.push(join(tree, relative));
}

const canLock = process.platform !== 'win32' && process.getuid?.() !== 0;

function build(): void {
	dir('repo');
	dir('repo/.git');
	file('repo/.gitignore', '.env\n.env.*.local\n');
	file('repo/.env', 'export API_URL=x\nDB_HOST=x\nDB_PORT=x\nSHARED=x\n');
	file('repo/.env.example', 'API_URL=\nDB_HOST=\nDB_PORT=\n');
	file('repo/.env.production', 'API_URL=x\nDB_HOST=x\nSHARED=x\nPROD_ONLY=x\n');
	file('repo/.env.development.local', 'API_URL=x\nDB_HOST=x\nDB_PORT=x\nDEBUG=x\n');
	file('repo/.env.case', 'api_url=x\ndb_host=x\ndb_port=x\nshared=x\n');
	file('repo/.env.bom', '﻿API_URL=x\nDB_HOST=x\nDB_PORT=x\nSHARED=x\n');
	file(
		'repo/.env.broken',
		'API_URL=x\n2BAD=x\nno equals here\n=empty\nDB_HOST="spans\nlines"\nexport\tDB_PORT=x\nSHARED=x\nSHARED=again\nCERT="never closed\nLATER=x\n',
	);
	file('repo/.env.crlf', 'API_URL=x\r\nDB_HOST=x\r\nDB_PORT=x\r\nSHARED=x\r\n');
	file('repo/.env.latin1', Buffer.from([0x41, 0x3d, 0xe9, 0x0a]));
	file('repo/app.env', 'API_URL=x\n');
	file('repo/README.md', 'API_URL=not a dotenv file\n');
	dir('repo/sub');
	file('repo/sub/.env.test', 'API_URL=x\nDB_HOST=x\nDB_PORT=x\nSHARED=x\nTEST_ONLY=x\n');
	dir('repo/config');
	file('repo/config/.env.example', 'API_URL=\n');
	dir('repo/a');
	file('repo/a/.env', 'API_URL=x\n');
	dir('repo/a.b');
	file('repo/a.b/.env', 'API_URL=x\nDB_HOST=x\n');
	dir('repo/.hidden');
	file('repo/.hidden/.env.staging', 'API_URL=x\nSTAGING=x\n');
	// Windows grants symlinks to administrators and developer mode only.
	try {
		symlinkSync(join(tree, 'repo', '.env'), join(tree, 'repo', '.env.link'));
		created.push(join(tree, 'repo', '.env.link'));
	} catch {
		file('repo/.env.link', 'API_URL=x\n');
	}

	dir('flat');
	file('flat/.env', 'A=1\nB=2\n');
	file('flat/.env.example', 'A=\nB=\n');

	dir('empty');
	file('empty/notes.txt', 'nothing\n');

	if (canLock) {
		file('repo/.env.locked', 'API_URL=x\n');
		chmodSync(join(tree, 'repo', '.env.locked'), 0o000);
		dir('closed');
		dir('closed/shut');
		file('closed/shut/.env', 'A=1\n');
		chmodSync(join(tree, 'closed', 'shut'), 0o000);
	}
	if (process.platform !== 'win32') {
		const fifo = join(tree, 'flat', '.env.fifo');
		if (spawnSync('mkfifo', [fifo]).status === 0) created.push(fifo);
	}
}

function cases(): readonly Case[] {
	const repo = join(tree, 'repo');
	return [
		{ args: ['--help'] },
		{ args: ['-h'] },
		{ args: ['--version'] },
		{ args: ['-V'] },
		{ args: [], cwd: 'flat' },
		{ args: [], cwd: 'repo' },
		{ args: ['.'], cwd: 'repo' },
		{ args: ['./'], cwd: 'repo' },
		{ args: ['repo'] },
		{ args: ['repo/'] },
		{ args: ['./repo'] },
		{ args: [repo] },
		{ args: ['repo', '--hidden'] },
		{ args: ['repo', '--no-ignore'] },
		{ args: ['repo', '--strict'] },
		{ args: ['repo', '--ignore-case'] },
		{ args: ['repo', '--template', '.env.example'] },
		{ args: ['repo', '--template', './.env.example'] },
		{ args: ['repo', '--template', `${repo}/.env.example`] },
		{ args: ['repo', '--template', 'config/.env.example'] },
		{ args: ['repo', '--template', 'repo/config/.env.example'] },
		{ args: ['repo', '--template', 'nowhere/.env.example'] },
		{ args: ['repo', '--template', ''] },
		{ args: ['repo', '--template', '.env.case', '--ignore-case'] },
		{ args: ['repo', '--exclude', '.env.*.local', '--exclude', 'sub/**'] },
		{ args: ['repo', '--exclude', '**/.env.example', '--exclude', '.env.{bom,crlf,case}'] },
		{ args: ['repo', '--exclude', '.env.[bc]*', '--exclude', '.env.[!l]*'] },
		{ args: ['repo', '--exclude', '[z-a]'] },
		{ args: ['repo', '--exclude', '.env.?ase'] },
		{ args: ['repo/.env.example'] },
		{ args: ['./repo/.env.example', '--template', '.env.example'] },
		{ args: [`${tree}/repo/.env.production`] },
		{ args: ['repo/README.md'] },
		{ args: ['empty'] },
		{ args: ['missing'] },
		{ args: ['--file', 'repo/.env', '--file', 'repo/.env.example'] },
		{ args: ['--file', './repo/.env', '--file', 'repo//.env.production', '--template', 'repo/.env.production'] },
		{ args: ['--file', 'repo/.env', '--file', 'repo/.env', '--template', 'repo/.env'] },
		{ args: ['--file', 'repo/.env.example', '--file', 'missing.env'] },
		{ args: ['--file', 'no/such/.env', '--file', 'repo/.env/below'] },
		{ args: ['--strict', '--file', 'repo/.env.example', '--file', 'missing.env'] },
		{ args: ['--file', 'repo'] },
		{ args: ['--file', 'repo/.env.latin1', '--file', 'repo/.env.bom'] },
		{ args: ['--file', 'repo/.env.link', '--file', 'repo/.env.crlf'] },
		{ args: ['--file', 'repo/README.md'] },
		{ args: ['--file', '.env', '--file', 'sub/.env.test'], cwd: 'repo' },
		...(process.platform === 'win32' ? [] : [{ args: ['--file', 'flat/.env.fifo', '--file', 'flat/.env'] }]),
		...(canLock
			? [{ args: ['closed'] }, { args: ['--file', 'repo/.env.locked'] }, { args: ['--strict', '--file', 'repo/.env.locked'] }]
			: []),
		{ args: ['repo', 'flat'] },
		{ args: ['--file', 'repo/.env', 'repo'] },
		{ args: ['--tempate', 'x'] },
		{ args: ['--template'] },
		{ args: ['--exclude'] },
		{ args: ['--file'] },
		{ args: ['-'] },
		{ args: ['repo', '--help'] },
		{ args: ['repo', 'mcp'] },
		{ args: ['--values'] },
		{ args: [join(ROOT, 'crate', 'fixtures')] },
		{ args: [join(ROOT, 'samples'), '--hidden'] },
	];
}

function run(command: readonly string[], testCase: Case): Outcome {
	const [program, ...rest] = command as [string, ...string[]];
	const result = spawnSync(program, [...rest, ...testCase.args], {
		input: '',
		cwd: join(tree, testCase.cwd ?? ''),
	});
	return {
		status: result.status,
		stdout: result.stdout.toString('utf8'),
		stderr: result.stderr.toString('utf8'),
	};
}

function compareCli(): string[] {
	const failures: string[] = [];
	for (const testCase of cases()) {
		const rust = run([RUST], testCase);
		const node = run([NODE, NODE_CLI], testCase);
		for (const field of ['status', 'stdout', 'stderr'] as const) {
			if (rust[field] === node[field]) continue;
			failures.push(
				`envsync-le ${testCase.args.join(' ')}${testCase.cwd ? ` (in ${testCase.cwd})` : ''}\n  ${field} differs\n` +
					`  rust: ${JSON.stringify(rust[field])}\n  node: ${JSON.stringify(node[field])}`,
			);
		}
	}
	return failures;
}

/** Key order is not compared: the crate's JSON values are sorted maps. */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (typeof value !== 'object' || value === null) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
	);
}

/** Tool results with the text half parsed, so pretty-printing order cannot differ. */
function comparable(response: Record<string, unknown>): unknown {
	const result = response.result as Record<string, unknown> | undefined;
	const content = result?.content as { type: string; text: string }[] | undefined;
	if (!content || result?.isError === true) return canonical(response);
	const parsed = content.map((item) => ({ ...item, text: JSON.parse(item.text) }));
	return canonical({ ...response, result: { ...result, content: parsed } });
}

function mcpRequests(): readonly Record<string, unknown>[] {
	const repo = join(tree, 'repo');
	const call = (id: number, name: string, args: Record<string, unknown>) => ({
		jsonrpc: '2.0',
		id,
		method: 'tools/call',
		params: { name, arguments: args },
	});
	return [
		call(1, 'envsync_le_check', { path: repo }),
		call(2, 'envsync_le_check', { path: repo, ignored: true }),
		call(12, 'envsync_le_check', { path: repo, ignored: false }),
		call(3, 'envsync_le_check', {
			path: repo,
			ignored: true,
			hidden: true,
			template: '.env.example',
			caseSensitive: false,
			exclude: ['sub/**', 7, '.env.*.local'],
		}),
		call(4, 'envsync_le_check', { path: 'repo', template: 'nowhere' }),
		call(5, 'envsync_le_check', { path: join(tree, 'missing') }),
		call(6, 'envsync_le_check', {}),
		call(7, 'envsync_le_check', { path: 7 }),
		call(8, 'envsync_le_check', { path: join(repo, '.env.example'), caseSensitive: 'no' }),
		call(9, 'envsync_le_check', { path: join(tree, 'empty') }),
		call(10, 'compare_env_files', {
			files: [
				{ path: '.env.example', content: 'A=\nB=\n' },
				{ path: '.env', content: 'A=1\nC=3\n' },
			],
			mode: 'template',
			templatePath: '.env.example',
		}),
		call(11, 'compare_env_files', { files: [] }),
	];
}

function serve(command: readonly string[], requests: readonly unknown[]): Record<string, unknown>[] {
	const [program, ...rest] = command as [string, ...string[]];
	const input = `${requests.map((request) => JSON.stringify(request)).join('\n')}\n`;
	const result = spawnSync(program, [...rest, 'mcp'], { input, encoding: 'utf8', cwd: tree });
	return result.stdout
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function compareMcp(): string[] {
	const failures: string[] = [];
	const list = { jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} };
	const requests = [list, ...mcpRequests()];
	const rust = serve([RUST], requests);
	const node = serve([NODE, NODE_CLI], requests);
	// By id, not by line: the npm server answers each call as it finishes,
	// which JSON-RPC allows, so its replies need not arrive in request order.
	const byId = (replies: Record<string, unknown>[], id: unknown) =>
		replies.find((reply) => reply.id === id) ?? {};
	for (const request of requests) {
		const left = JSON.stringify(comparable(byId(rust, request.id)));
		const right = JSON.stringify(comparable(byId(node, request.id)));
		if (left === right) continue;
		failures.push(
			`envsync-le mcp ${JSON.stringify((request as { params: unknown }).params)}\n` +
				`  rust: ${left}\n  node: ${right}`,
		);
	}
	return failures;
}

function cleanUp(): void {
	const locked = join(tree, 'repo', '.env.locked');
	if (existsSync(locked)) chmodSync(locked, 0o600);
	const shut = join(tree, 'closed', 'shut');
	if (existsSync(shut)) chmodSync(shut, 0o700);
	for (const path of created) unlinkSync(path);
	for (const path of [...dirs].reverse()) rmdirSync(path);
}

build();
let failures: string[];
try {
	failures = [...compareCli(), ...compareMcp()];
} finally {
	cleanUp();
}

if (failures.length > 0) {
	console.error(failures.join('\n\n'));
	console.error(`\nFAIL: ${failures.length} difference(s) between the npm and Rust CLIs`);
	process.exit(1);
}
console.log(`OK: the npm CLI matches the Rust CLI on ${cases().length} commands and the MCP surface`);
