import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { capped, isOk, readMaxResults, toDiagnostics } from './envelope';
import { TOOLS } from './tools';
import { createResponder, MAX_FRAME_BYTES, serve } from './transport';

/**
 * The MCP layer: the normalisation boundary, the tool table and the protocol.
 *
 * The engine is covered by its own tests. What is new here is that a dotenv
 * file is where credentials live, so the boundary must return key names and
 * nothing else — and that files being out of sync is the finding, not a
 * failure.
 */

const EXAMPLE = { path: '.env.example', content: 'API_URL=\nAPI_KEY=\nDEBUG=' };
const ACTUAL = {
	path: '.env',
	content: 'API_URL=http://localhost\nDEBUG=1',
};

const call = async (args: Record<string, unknown>) => {
	const tool = TOOLS[0];
	if (!tool) throw new Error('no tool');
	return (await tool.handler(args)) as {
		ok: boolean;
		data: {
			status: string;
			files: { path: string; type: string; keyCount: number }[];
			missingKeys: { filepath: string; keys: string[] }[];
			extraKeys: { filepath: string; keys: string[] }[];
		};
		meta: { count: number; truncated: boolean };
	};
};

describe('compare_env_files never returns a value', () => {
	it('reports the missing key without leaking any value', async () => {
		// Serialising the whole envelope rather than checking known fields: a new
		// field must not be able to smuggle a value out through a path this test
		// did not think to look at.
		const result = await call({
			files: [EXAMPLE, ACTUAL],
			mode: 'template',
			templatePath: '.env.example',
		});
		expect(
			result.data.missingKeys.some((m) => m.keys.includes('API_KEY')),
		).toBe(true);
		expect(JSON.stringify(result)).not.toContain('http://localhost');
	});

	it('reports key counts rather than keys per file', async () => {
		const result = await call({ files: [EXAMPLE, ACTUAL] });
		for (const file of result.data.files) {
			expect(file.keyCount).toBeGreaterThan(0);
		}
	});
});

describe('ok reports the comparison, not the verdict', () => {
	it('is ok when files disagree', async () => {
		// Out of sync is the answer to the question, not a failure to answer it.
		const result = await call({
			files: [EXAMPLE, ACTUAL],
			mode: 'template',
			templatePath: '.env.example',
		});
		expect(result.ok).toBe(true);
		expect(result.data.status).not.toBe('in-sync');
	});

	it('is not ok when a file could not be parsed', () => {
		expect(
			isOk(
				toDiagnostics([
					{
						type: 'parse-error',
						message: 'unterminated quote',
						filepath: '.env',
					},
				]),
			),
		).toBe(false);
	});

	it('is ok when nothing was reported', () => {
		expect(isOk(toDiagnostics([]))).toBe(true);
	});
});

describe('envelope: result cap', () => {
	it('reports truncation honestly when it drops items', () => {
		const { items, truncated } = capped([1, 2, 3, 4, 5], 2);
		expect(items).toEqual([1, 2]);
		expect(truncated).toBe(true);
	});

	it('rejects a maxResults a tool cannot honour', () => {
		expect(() => readMaxResults({ maxResults: 0 })).toThrow(/positive integer/);
		expect(() => readMaxResults({ maxResults: 1.5 })).toThrow();
	});

	it('clamps an oversized request rather than refusing it', () => {
		expect(readMaxResults({ maxResults: 999999 })).toBe(5000);
	});
});

describe('tool table', () => {
	it('pins the tool names', () => {
		expect(TOOLS.map((t) => t.name)).toEqual(['compare_env_files']);
	});

	it('gives every tool a description and a closed schema', () => {
		for (const tool of TOOLS) {
			expect(tool.description.length).toBeGreaterThan(20);
			expect(tool.inputSchema.type).toBe('object');
			expect(tool.inputSchema.additionalProperties).toBe(false);
			expect(typeof tool.handler).toBe('function');
		}
	});
});

describe('compare_env_files: arguments', () => {
	it('finds nothing extra in auto mode', async () => {
		// Documented engine behaviour: the reference is the union of all keys, so
		// nothing can be extra. The description says so rather than implying a
		// mode that does not exist.
		const result = await call({ files: [EXAMPLE, ACTUAL] });
		expect(result.data.extraKeys).toEqual([]);
	});

	it('requires a template path in template mode', async () => {
		await expect(
			call({ files: [EXAMPLE, ACTUAL], mode: 'template' }),
		).rejects.toThrow(/templatePath is required/);
	});

	it('rejects a mode the engine does not have', async () => {
		await expect(call({ files: [EXAMPLE], mode: 'manual' })).rejects.toThrow(
			/mode must be/,
		);
	});

	it('requires a non-empty files array', async () => {
		await expect(call({})).rejects.toThrow(/files is required/);
		await expect(call({ files: [] })).rejects.toThrow(/files is required/);
	});

	it('names the entry that is malformed', async () => {
		await expect(call({ files: [{ path: '.env' }] })).rejects.toThrow(
			/files\[0\]/,
		);
	});
});

describe('protocol', () => {
	const respond = createResponder(
		{ name: 'envsync-le', version: '1.0.0' },
		TOOLS,
	);

	it('echoes the protocol version the client asked for', async () => {
		const reply = await respond({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: '2024-11-05' },
		});
		expect(reply?.result?.protocolVersion).toBe('2024-11-05');
		expect(reply?.result?.serverInfo).toEqual({
			name: 'envsync-le',
			version: '1.0.0',
		});
	});

	it('does not reply to a notification', async () => {
		// A reply to a notification is the classic way to wedge a client.
		expect(
			await respond({ jsonrpc: '2.0', method: 'notifications/initialized' }),
		).toBeNull();
	});

	it('reports an unknown method as a JSON-RPC error', async () => {
		const reply = await respond({ jsonrpc: '2.0', id: 2, method: 'nope' });
		expect(reply?.error?.code).toBe(-32601);
	});

	it('reports an unknown tool without killing the connection', async () => {
		const reply = await respond({
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/call',
			params: { name: 'no_such_tool', arguments: {} },
		});
		expect(reply?.error?.code).toBe(-32602);
	});

	it('returns a tool failure as a result, not a protocol error', async () => {
		// A model can read an isError result and correct itself; a JSON-RPC error
		// reads as "the server is broken".
		const reply = await respond({
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: { name: 'compare_env_files', arguments: {} },
		});
		expect(reply?.error).toBeUndefined();
		expect(reply?.result?.isError).toBe(true);
	});
});

describe('serve: the stdio loop', () => {
	/** A fake stdin/stdout pair so the loop can be driven without a process. */
	function harness() {
		const input = new EventEmitter() as EventEmitter & {
			setEncoding?: (e: string) => void;
		};
		const written: string[] = [];
		const output = {
			write: (chunk: string) => {
				written.push(chunk);
				return true;
			},
		};
		serve(
			{ name: 'envsync-le', version: '1.0.0' },
			TOOLS,
			input as never,
			output as never,
		);
		const replies = () =>
			written
				.join('')
				.split('\n')
				.filter(Boolean)
				.map((l) => JSON.parse(l));
		return { input, replies };
	}

	const settle = () => new Promise((r) => setTimeout(r, 20));

	it('answers a request delivered as one line', async () => {
		const { input, replies } = harness();
		input.emit('data', '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
		await settle();
		expect(replies()[0]?.result?.tools).toHaveLength(1);
	});

	it('reassembles a request split across chunks', async () => {
		// stdin delivers whatever the OS gives it; a request arriving in two
		// pieces must not be dropped or double-parsed.
		const { input, replies } = harness();
		input.emit('data', '{"jsonrpc":"2.0","id":2,"me');
		input.emit('data', 'thod":"ping"}\n');
		await settle();
		expect(replies()[0]?.id).toBe(2);
	});

	it('handles several requests in one chunk', async () => {
		const { input, replies } = harness();
		input.emit(
			'data',
			'{"jsonrpc":"2.0","id":3,"method":"ping"}\n{"jsonrpc":"2.0","id":4,"method":"ping"}\n',
		);
		await settle();
		expect(replies().map((r) => r.id)).toEqual([3, 4]);
	});

	it('reports malformed JSON without dying', async () => {
		// One bad line from a client must not take the server down for everyone.
		const { input, replies } = harness();
		input.emit('data', 'not json at all\n');
		input.emit('data', '{"jsonrpc":"2.0","id":5,"method":"ping"}\n');
		await settle();
		expect(replies()[0]?.error?.code).toBe(-32700);
		expect(replies()[1]?.id).toBe(5);
	});

	it('rejects a payload that is not a JSON-RPC request', async () => {
		const { input, replies } = harness();
		input.emit('data', '{"hello":"world"}\n');
		await settle();
		expect(replies()[0]?.error?.code).toBe(-32700);
	});

	it('ignores blank lines', async () => {
		const { input, replies } = harness();
		input.emit('data', '\n\n{"jsonrpc":"2.0","id":6,"method":"ping"}\n');
		await settle();
		expect(replies()).toHaveLength(1);
	});

	it('writes nothing for a notification', async () => {
		const { input, replies } = harness();
		input.emit(
			'data',
			'{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
		);
		await settle();
		expect(replies()).toHaveLength(0);
	});

	it('refuses a frame over the limit whose newline arrives in the same chunk', async () => {
		// The over-limit check on the leftover buffer never sees a line that
		// arrives whole; the limit is on the line, not on its framing.
		const { input, replies } = harness();
		input.emit(
			'data',
			`${'x'.repeat(MAX_FRAME_BYTES + 1)}\n{"jsonrpc":"2.0","id":8,"method":"ping"}\n`,
		);
		await settle();
		expect(replies().map((r) => r.error?.message ?? r.id)).toEqual([
			`Message exceeds the ${MAX_FRAME_BYTES} byte frame limit`,
			8,
		]);
	});

	it('refuses a frame over the limit and keeps serving', async () => {
		// Input with no newline grew the buffer without bound: 64 MiB of it
		// held the process near a gigabyte and answered nothing. Past the
		// limit the frame is refused with a parse error, the rest of that line
		// is dropped as it arrives, and the next line is served.
		const { input, replies } = harness();
		input.emit('data', 'x'.repeat(MAX_FRAME_BYTES + 1));
		input.emit('data', 'y'.repeat(1000));
		input.emit('data', 'z\n{"jsonrpc":"2.0","id":9,"method":"ping"}\n');
		await settle();
		expect(replies()).toEqual([
			{
				jsonrpc: '2.0',
				id: null,
				error: {
					code: -32700,
					message: `Message exceeds the ${MAX_FRAME_BYTES} byte frame limit`,
				},
			},
			{ jsonrpc: '2.0', id: 9, result: {} },
		]);
	});
});
