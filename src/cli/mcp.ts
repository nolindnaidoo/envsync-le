/**
 * `envsync-le mcp`: the crate's MCP server (`crate/src/mcp/mod.rs`), not the
 * extension's. The tools are the extension's own handlers; the protocol
 * around them is the crate's, so a request answers the same from either
 * binary, the malformed ones included, and in the words the extension's
 * server uses, so a client cannot tell the three apart by what it sent.
 */
import type { ServerInfo, ToolDefinition } from '../mcp/transport';
import { frames, type Request } from './frames';

const PROTOCOL_VERSION = '2025-06-18';
const PARSE_ERROR = -32700;
const INVALID_PARAMS = -32602;
const METHOD_NOT_FOUND = -32601;

type Handled =
	| { readonly result: unknown }
	| { readonly error: { readonly code: number; readonly message: string } };

/**
 * Serves until stdin closes, one request at a time, in order, over the
 * crate's framing in `frames.ts`. A frame the framing refuses is answered
 * with a parse error, as the crate answers it. `write` answers with a
 * promise when the pipe is full, and the next frame waits on it, as the
 * crate's blocking write waits: a client that reads slowly holds its
 * replies in the pipe, not in this process.
 */
export async function serve(
	input: AsyncIterable<Uint8Array>,
	write: (line: string) => Promise<void> | undefined,
	info: ServerInfo,
	tools: readonly ToolDefinition[],
): Promise<number> {
	for await (const frame of frames(input)) {
		if ('refusal' in frame) {
			await write(
				`${reply({ id: null, error: { code: PARSE_ERROR, message: frame.refusal } })}\n`,
			);
			continue;
		}
		const response = await handle(frame.request, info, tools);
		if (response !== undefined) await write(`${response}\n`);
	}
	return 0;
}

function reply(body: Record<string, unknown>): string {
	return JSON.stringify({ jsonrpc: '2.0', ...body });
}

/** serde_json's `get`: a field of an object, and nothing for anything else. */
function field(value: unknown, name: string): unknown {
	if (!isObject(value)) return undefined;
	return Object.hasOwn(value, name) ? value[name] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function handle(
	request: Request,
	info: ServerInfo,
	tools: readonly ToolDefinition[],
): Promise<string | undefined> {
	// A notification carries no id, or a null one, and gets no reply.
	if (request.id === undefined || request.id === null) return undefined;
	const handled = await dispatch(request.method, request.params, info, tools);
	return reply({ id: request.id, ...handled });
}

async function dispatch(
	method: string,
	params: unknown,
	info: ServerInfo,
	tools: readonly ToolDefinition[],
): Promise<Handled> {
	if (method === 'initialize') {
		return {
			result: {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: { name: info.name, version: info.version },
			},
		};
	}
	if (method === 'tools/list') {
		const listing = tools.map(({ name, description, inputSchema }) => ({
			name,
			description,
			inputSchema,
		}));
		return { result: { tools: listing } };
	}
	if (method === 'tools/call') return callTool(params, tools);
	if (method === 'ping') return { result: {} };
	return {
		error: { code: METHOD_NOT_FOUND, message: `Unknown method: ${method}` },
	};
}

/**
 * Protocol failures are JSON-RPC errors. A tool that fails on its arguments
 * returns a result carrying `isError`, so a model reads the reason rather than
 * concluding the server is broken.
 */
async function callTool(
	params: unknown,
	tools: readonly ToolDefinition[],
): Promise<Handled> {
	const name = field(params, 'name');
	if (typeof name !== 'string') {
		return {
			error: {
				code: INVALID_PARAMS,
				message: 'tools/call requires a string `name`',
			},
		};
	}
	const tool = tools.find((candidate) => candidate.name === name);
	if (!tool) {
		return {
			error: { code: INVALID_PARAMS, message: `Unknown tool: ${name}` },
		};
	}
	// Absent or null arguments are an empty object, which the tool then
	// refuses for what it lacks; arguments that are not an object read the
	// same way, as serde_json answers `get` on anything but an object with
	// nothing.
	const raw = field(params, 'arguments');
	const args = isObject(raw) ? raw : {};
	let envelope: unknown;
	try {
		envelope = await tool.handler(args);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			result: { content: [{ type: 'text', text: message }], isError: true },
		};
	}
	return {
		result: {
			content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
			structuredContent: envelope,
			isError: false,
		},
	};
}
