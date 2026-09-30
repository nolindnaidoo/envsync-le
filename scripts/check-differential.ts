/**
 * Generated cross-server parity for the tool BOTH MCP servers offer.
 *
 * `compare_env_files` is one tool with one schema served by two
 * implementations — the npm server that ships inside the extension, and
 * the Rust CLI's. An agent asking it must get the same answer whichever
 * server it happens to reach, so this feeds generated documents to both
 * and requires the same envelope back.
 *
 * **Scope is the shared tool, deliberately.** The two surfaces around it
 * are allowed to differ and should: the extension is IDE-first, one
 * workspace and a person reading results in an editor; the CLI is
 * terminal-first, whole trees and an exit code a pipeline branches on.
 * The walk, `--template`, `--strict` and the exit codes exist on one side
 * only and that is not drift. What may never differ is the answer to the
 * same question asked of the same tool.
 *
 * The corpus in `crate/fixtures/` pins cases somebody thought of. This
 * generates the ones nobody did: every document combines a file name from
 * the classifier table, a value the parser must never report, and a
 * wrapper — quoted, multi-line, unterminated, commented, exported,
 * duplicated, CRLF, byte-order-marked, or ending without a newline.
 *
 * Seeded and reproducible. The seed is printed on every run and named in
 * every failure.
 *
 * Run: bun scripts/check-differential.ts
 *   DIFFERENTIAL_SEED=123 DIFFERENTIAL_CASES=2000 bun scripts/check-differential.ts
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { TOOLS } from '../src/mcp/tools';

const ROOT = join(import.meta.dir, '..');
const SEED = BigInt(process.env.DIFFERENTIAL_SEED ?? '20260812');
/** N >= 500: below that the wrapper combinations are not all reached. */
const CASES = Number(process.env.DIFFERENTIAL_CASES ?? '600');
const BINARY =
	process.env.ENVSYNC_LE_BIN ?? join(ROOT, 'crate', 'target', 'debug', 'envsync-le');

/**
 * xorshift64*, the same generator the crate's fuzz target uses. A
 * differential nobody can reproduce is a differential nobody fixes.
 */
class Seeded {
	private state: bigint;
	private static readonly MASK = (1n << 64n) - 1n;

	constructor(seed: bigint) {
		this.state = seed === 0n ? 1n : seed & Seeded.MASK;
	}

	next(): bigint {
		let state = this.state;
		state ^= state >> 12n;
		state = (state ^ (state << 25n)) & Seeded.MASK;
		state ^= state >> 27n;
		this.state = state;
		return (state * 0x2545f4914f6cdd1dn) & Seeded.MASK;
	}

	below(limit: number): number {
		return Number(this.next() % BigInt(limit));
	}

	pick<T>(from: readonly T[]): T {
		return from[this.below(from.length)] as T;
	}
}

/** Every name the classifier has an opinion about. */
const NAMES = [
	'.env',
	'.env.local',
	'.env.example',
	'.env.template',
	'.env.production',
	'.env.prod',
	'.env.development',
	'.env.dev',
	'.env.test',
	'.env.production.local',
	'foo.env',
	'app.device.env',
	'nested/service/.env',
] as const;

const QUOTES = ['"', "'", '`'] as const;

type Document = Readonly<{ path: string; content: string }>;

/**
 * One generated document. Values carry a `~` so a leak is visible: a key
 * name can never contain one.
 */
function generate(seeded: Seeded): Document {
	const path = seeded.pick(NAMES);
	const lines: string[] = [];
	let openQuote: string | null = null;

	const entries = 1 + seeded.below(12);
	for (let index = 0; index < entries; index++) {
		const key = `KEY_${index}`;
		const value = `~v${seeded.below(1_000_000)}~`;
		// A quote already open is closed by the next line carrying the
		// same character, so once one is open only quote-free lines follow
		// — otherwise the case stops being about the wrapper under test.
		let arm = seeded.below(12);
		if (openQuote !== null && (arm === 6 || arm === 7)) {
			arm = 11;
		}

		switch (arm) {
			case 0:
				lines.push(`# a comment ${value}`);
				break;
			case 1:
				lines.push('');
				break;
			case 2:
				lines.push(`JUST_A_WORD_${index}`);
				break;
			case 3:
				// An invalid name, a dotted one, and one that starts with a dot.
				lines.push(
					seeded.pick([
						`2BAD_${index}=${value}`,
						`app.key_${index}.url=${value}`,
						`.hidden_${index}=${value}`,
					]),
				);
				break;
			case 4:
				lines.push(`export ${key}=${value}`);
				break;
			case 5:
				lines.push(`KEY_${Math.max(index - 1, 0)}=${value}`);
				break;
			case 6: {
				const quote = seeded.pick(QUOTES);
				lines.push(`${key}=${quote}${value}`, `more ${value}`, quote);
				break;
			}
			case 7: {
				const quote = seeded.pick(QUOTES);
				lines.push(`${key}=${quote}${value}`);
				openQuote = quote;
				break;
			}
			case 8:
				lines.push(`   ${key}   =   ${value}\u{1F389}`);
				break;
			case 9:
				lines.push(`${key}=${value}\u0000\u007f`);
				break;
			case 10:
				// A byte-order mark that is not the first byte: whitespace
				// to one runtime and not the other, which is exactly the
				// kind of disagreement this exists to find.
				lines.push(`\uFEFF${key}=${value}`);
				break;
			default:
				lines.push(`${key}=${value}`);
				break;
		}
	}

	const newline = seeded.below(4) === 0 ? '\r\n' : '\n';
	let content = lines.join(newline);
	if (seeded.below(8) === 0) {
		content = `\uFEFF${content}`;
	}
	// Half end with a newline and half do not.
	if (seeded.below(2) === 0) {
		content += newline;
	}
	return { path, content };
}

/** Both files, plus the mode the case asks the tool for. */
function argumentsFor(seeded: Seeded, document: Document): Record<string, unknown> {
	const template = generate(seeded);
	const files = [
		{ path: '.env.example', content: template.content },
		{ path: document.path, content: document.content },
	];
	const templateMode = seeded.below(2) === 0;
	return {
		files,
		...(templateMode ? { mode: 'template', templatePath: '.env.example' } : {}),
		...(seeded.below(3) === 0 ? { caseSensitive: false } : {}),
	};
}

/**
 * Key order is not part of the contract — one side builds objects in
 * insertion order and the other in sorted order — so both answers are
 * canonicalised before the comparison. Everything else is compared byte
 * for byte.
 */
function canonical(value: unknown): string {
	const sort = (input: unknown): unknown => {
		if (Array.isArray(input)) return input.map(sort);
		if (input === null || typeof input !== 'object') return input;
		const entries = Object.entries(input as Record<string, unknown>)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return Object.fromEntries(entries.map(([key, item]) => [key, sort(item)]));
	};
	return JSON.stringify(sort(value));
}

/** The Rust server, held open for the whole run. */
class CrateServer {
	private readonly child;
	private readonly pending: ((line: string) => void)[] = [];
	private readonly stderr: string[] = [];

	constructor() {
		this.child = spawn(BINARY, ['mcp'], {
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		this.child.on('error', (error) => {
			console.error(
				`could not run ${BINARY}: ${error.message}\nBuild it first: cd crate && cargo build --locked`,
			);
			process.exit(1);
		});
		this.child.stderr?.on('data', (chunk) => this.stderr.push(String(chunk)));
		createInterface({ input: this.child.stdout }).on('line', (line) => {
			const resolve = this.pending.shift();
			if (resolve) resolve(line);
		});
	}

	call(args: Record<string, unknown>): Promise<unknown> {
		const request = {
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/call',
			params: { name: 'compare_env_files', arguments: args },
		};
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(
					new Error(
						`the crate server did not answer in 30s${this.stderr.length ? `\n${this.stderr.join('')}` : ''}`,
					),
				);
			}, 30_000);
			this.pending.push((line) => {
				clearTimeout(timer);
				resolve(JSON.parse(line));
			});
			this.child.stdin?.write(`${JSON.stringify(request)}\n`);
		});
	}

	close(): void {
		this.child.stdin?.end();
		this.child.kill();
	}
}

const tool = TOOLS.find((candidate) => candidate.name === 'compare_env_files');
if (!tool) {
	console.error('the extension no longer offers compare_env_files');
	process.exit(1);
}

console.log(
	`differential: seed ${SEED}, ${CASES} cases, binary ${BINARY.replace(ROOT, '.')}`,
);

const seeded = new Seeded(SEED);
const server = new CrateServer();
let checked = 0;

for (let index = 0; index < CASES; index++) {
	const document = generate(seeded);
	const args = argumentsFor(seeded, document);

	const fromExtension = await tool.handler(structuredClone(args));
	const response = (await server.call(args)) as {
		error?: { message: string };
		result?: { structuredContent?: unknown };
	};

	if (response.error) {
		server.close();
		console.error(
			`differential FAILED (seed ${SEED}, case ${index}): the crate server refused the call\n` +
				`  ${response.error.message}\n  arguments: ${JSON.stringify(args)}`,
		);
		process.exit(1);
	}

	const fromCrate = response.result?.structuredContent;
	if (canonical(fromExtension) !== canonical(fromCrate)) {
		server.close();
		console.error(
			`differential FAILED (seed ${SEED}, case ${index})\n\n` +
				'The two servers answered the same call differently. This is the SHARED\n' +
				'tool, so the difference is a bug in one of them — not an IDE-versus-\n' +
				'terminal surface difference, which would belong in crate/SPEC.md under\n' +
				'"Deliberate divergences".\n\n' +
				`  document ${document.path}:\n${JSON.stringify(document.content)}\n\n` +
				`  arguments: ${JSON.stringify(args)}\n\n` +
				`  extension: ${canonical(fromExtension)}\n\n` +
				`  crate:     ${canonical(fromCrate)}\n`,
		);
		process.exit(1);
	}

	// The property the whole product rests on, checked on both answers.
	const both = canonical(fromExtension) + canonical(fromCrate);
	const leaked = both.match(/~v\d+~/);
	if (leaked) {
		server.close();
		console.error(
			`differential FAILED (seed ${SEED}, case ${index}): a value reached the answer (${leaked[0]})\n` +
				`  document ${document.path}:\n${JSON.stringify(document.content)}\n` +
				`  answer: ${canonical(fromCrate)}`,
		);
		process.exit(1);
	}
	checked++;
}

server.close();
console.log(
	`OK: ${checked} generated documents, both servers byte-identical, no value in either answer (seed ${SEED}).`,
);
