/**
 * `<tool> mcp`: the crate's MCP server (`crate/src/mcp/mod.rs`), not the
 * extension's. The tools are the extension's own handlers; the protocol
 * around them is the crate's, so a request answers the same from either
 * binary, the malformed ones included.
 */
import type { ServerInfo, ToolDefinition } from '../mcp/transport';
import { requests } from './frames';

const PROTOCOL_VERSION = '2025-06-18';
const INVALID_PARAMS = -32602;
const METHOD_NOT_FOUND = -32601;

type Handled =
	| { readonly result: unknown }
	| { readonly error: { readonly code: number; readonly message: string } };

/** Serves until stdin closes, one request at a time, in order. */
export async function serve(
	input: AsyncIterable<Uint8Array>,
	write: (line: string) => void,
	info: ServerInfo,
	tools: readonly ToolDefinition[],
): Promise<number> {
	for await (const request of requests(input)) {
		const response = await handle(request, info, tools);
		if (response !== undefined) write(`${response}\n`);
	}
	return 0;
}

/** serde_json's `get`: a field of an object, and nothing for anything else. */
function field(value: unknown, name: string): unknown {
	if (!isObject(value)) return undefined;
	return Object.hasOwn(value, name) ? value[name] : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * No `jsonrpc` check, and a null id is still an id: the crate asks only for a
 * string method and an id that is present.
 */
export async function handle(
	request: unknown,
	info: ServerInfo,
	tools: readonly ToolDefinition[],
): Promise<string | undefined> {
	const method = field(request, 'method');
	if (typeof method !== 'string') return undefined;
	const id = field(request, 'id');
	// A notification carries no id and gets no reply.
	if (id === undefined) return undefined;
	const handled = await dispatch(method, field(request, 'params'), info, tools);
	return JSON.stringify({ jsonrpc: '2.0', id, ...handled });
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
		error: {
			code: METHOD_NOT_FOUND,
			message: `this server does not implement ${method}`,
		},
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
	if (params === undefined) {
		return {
			error: { code: INVALID_PARAMS, message: 'no tool call was supplied' },
		};
	}
	const name = field(params, 'name');
	if (typeof name !== 'string') {
		return {
			error: { code: INVALID_PARAMS, message: 'the tool call named no tool' },
		};
	}
	const tool = tools.find((candidate) => candidate.name === name);
	if (!tool) {
		return {
			error: {
				code: INVALID_PARAMS,
				message: `this server offers no tool named ${name}`,
			},
		};
	}
	// serde_json answers `get` on anything but an object with nothing, so
	// arguments that are not an object read as an empty one.
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
