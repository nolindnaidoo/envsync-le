/**
 * `envsync_le_check`, the tool the Rust server offers beside the shared
 * `compare_env_files`: a directory in, the same report the command line
 * writes. `envsync-le mcp` serves both, as the crate's does, so an agent
 * configured with either binary sees the same two tools.
 */
import { envelope } from '../mcp/envelope';
import type { ToolDefinition } from '../mcp/transport';
import { DEFAULT_DISCOVER } from './discover';
import { scan } from './scan';

const DESCRIPTION =
	'Compare the dotenv files in a directory and report which keys are missing from which. ' +
	'Reads the filesystem; never writes to it, and never reads a value — only key names are ' +
	'returned, because a dotenv file is where credentials live.';

async function check(args: Record<string, unknown>): Promise<unknown> {
	if (typeof args.path !== 'string')
		throw new Error('no directory was supplied to compare');
	const flag = (name: string): boolean => args[name] === true;
	const exclude = Array.isArray(args.exclude)
		? args.exclude.filter((item): item is string => typeof item === 'string')
		: [];

	// Never the ignore rules, whatever `ignored` says: a dotenv file is
	// git-ignored by design, and honouring them compared the committed
	// example against nothing and answered in sync.
	const report = scan(args.path, {
		template: typeof args.template === 'string' ? args.template : null,
		ignoreCase: args.caseSensitive === false,
		discover: {
			...DEFAULT_DISCOVER,
			hidden: flag('hidden'),
			exclude,
		},
	});
	const diagnostics = report.diagnostics.map((found) => ({
		severity: 'warning' as const,
		code: found.code,
		message: `${found.file}: ${found.message}`,
	}));
	return envelope(
		'envsync_le_check',
		report,
		report.files.length,
		diagnostics,
		false,
	);
}

export const CHECK_TOOL: ToolDefinition = Object.freeze({
	name: 'envsync_le_check',
	description: DESCRIPTION,
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'the directory to compare' },
			template: {
				type: 'string',
				description:
					'Compare every file against this one, relative to the directory. Without it the ' +
					'reference is the union of all keys and nothing can be extra.',
			},
			caseSensitive: {
				type: 'boolean',
				default: true,
				description: 'Whether key names are compared case-sensitively.',
			},
			exclude: {
				type: 'array',
				items: { type: 'string' },
				description: 'Glob patterns for files to skip.',
			},
			hidden: {
				type: 'boolean',
				default: false,
				description: 'Descend hidden directories too.',
			},
			ignored: {
				type: 'boolean',
				default: true,
				description:
					'Accepted and always on: a dotenv file is git-ignored by design, so honouring the ' +
					'ignore rules would compare the committed example against nothing.',
			},
		},
		required: ['path'],
	},
	handler: check,
});
