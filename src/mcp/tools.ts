import { compareFiles } from '../detection/comparator';
import { detectFileType } from '../detection/heuristics';
import { parseDotenvFile } from '../detection/parser';
import type { DotenvFile, ParseError } from '../types';
import {
	capped,
	DEFAULT_MAX_RESULTS,
	envelope,
	MAX_MAX_RESULTS,
	readMaxResults,
	toDiagnostics,
} from './envelope';
import type { ToolDefinition } from './transport';

/**
 * The tools this server exposes.
 *
 * Names are a public API with no deprecation channel — once an agent's prompt
 * or memory references `compare_env_files`, renaming it breaks silently. They
 * are pinned by a golden test for that reason.
 *
 * **Values never leave this server.** A dotenv file is where credentials live,
 * and the question this extension answers is about key *names* — which are
 * missing, which are extra. Returning values would send a production secret to
 * whatever cloud model called the tool for no gain, so the parser's key list is
 * the only thing that crosses the boundary.
 *
 * No tool touches the filesystem. The agent already has file-read tools;
 * duplicating them here would add a path-traversal surface for no capability.
 *
 * **The description is the API.** A model reads it to decide whether to call
 * this tool at all, so it states plainly what the tool handles rather than
 * gesturing at "many formats" — a model cannot reason about a vague claim, and
 * the cost is either a call that returns nothing or a tool never tried. The
 * same reasoning governs argument descriptions: each says what the value does,
 * not what type it is, because the type is already in the schema.
 */

// Advertised in the schema with its default visible, rather than silently
// enforced. A model that can see the cap can raise it when it genuinely needs
// more, and can read `meta.truncated` to know it should. A hidden cap just
// produces quietly incomplete answers.
const MAX_RESULTS_SCHEMA = {
	type: 'integer',
	minimum: 1,
	maximum: MAX_MAX_RESULTS,
	default: DEFAULT_MAX_RESULTS,
	description: `Cap on returned key mismatches (default ${DEFAULT_MAX_RESULTS}). meta.truncated reports whether any were dropped.`,
};

interface FileInput {
	readonly path: string;
	readonly content: string;
}

function readFiles(args: Record<string, unknown>): readonly FileInput[] {
	const raw = args.files;
	if (!Array.isArray(raw) || raw.length === 0) {
		throw new Error(
			'files is required and must be a non-empty array of { path, content }',
		);
	}

	return raw.map((entry, index) => {
		const file = entry as Record<string, unknown>;
		if (typeof file.path !== 'string' || typeof file.content !== 'string') {
			throw new Error(
				`files[${index}] must have string \`path\` and \`content\``,
			);
		}
		return { path: file.path, content: file.content };
	});
}

function readMode(args: Record<string, unknown>): 'auto' | 'template' {
	const raw = args.mode;
	if (raw === undefined) return 'auto';
	if (raw !== 'auto' && raw !== 'template') {
		throw new Error('mode must be "auto" or "template"');
	}
	return raw;
}

/**
 * A boolean or nothing. A string such as `"false"` was read as true before,
 * so a caller asking for a case-insensitive comparison the wrong way got a
 * case-sensitive one and no word about it.
 */
function readCaseSensitive(args: Record<string, unknown>): boolean {
	const raw = args.caseSensitive;
	if (raw === undefined) return true;
	if (typeof raw !== 'boolean') {
		throw new Error('caseSensitive must be true or false');
	}
	return raw;
}

function compare(args: Record<string, unknown>): Promise<unknown> {
	const inputs = readFiles(args);
	const maxResults = readMaxResults(args);
	const mode = readMode(args);
	const caseSensitive = readCaseSensitive(args);

	const templatePath =
		typeof args.templatePath === 'string' ? args.templatePath : undefined;
	if (mode === 'template' && !templatePath) {
		throw new Error('templatePath is required when mode is "template"');
	}

	const errors: ParseError[] = [];
	const files: DotenvFile[] = inputs.map((input) => {
		const parsed = parseDotenvFile(input.content, input.path);
		errors.push(...parsed.errors);
		return {
			path: input.path,
			type: detectFileType(input.path),
			keys: parsed.keys,
		};
	});

	const report = compareFiles(files, {
		mode,
		caseSensitive,
		...(templatePath ? { templatePath } : {}),
	});

	const missing = capped(report.missingKeys, maxResults);
	const extra = capped(report.extraKeys, maxResults);

	return Promise.resolve(
		envelope(
			'compare_env_files',
			{
				status: report.status,
				files: files.map((file) => ({
					path: file.path,
					type: file.type,
					keyCount: file.keys.length,
				})),
				missingKeys: missing.items,
				extraKeys: extra.items,
			},
			missing.items.length + extra.items.length,
			toDiagnostics(errors),
			missing.truncated || extra.truncated,
		),
	);
}

export const TOOLS: readonly ToolDefinition[] = Object.freeze([
	Object.freeze({
		name: 'compare_env_files',
		description:
			'Compare dotenv files and report which keys are missing from which file, and which are extra relative to a template. Takes file contents directly. Only key NAMES are returned — never values — because a dotenv file is where credentials live and the answer does not need them. In "auto" mode the reference is the union of all keys, so nothing can be extra; "template" mode compares every file against one named template.',
		inputSchema: {
			type: 'object',
			properties: {
				files: {
					type: 'array',
					minItems: 1,
					description: 'The dotenv files to compare.',
					items: {
						type: 'object',
						properties: {
							path: {
								type: 'string',
								description:
									'Path or filename, e.g. ".env.example". Used to classify the file and to label mismatches.',
							},
							content: {
								type: 'string',
								description: 'The file contents.',
							},
						},
						required: ['path', 'content'],
						additionalProperties: false,
					},
				},
				mode: {
					type: 'string',
					enum: ['auto', 'template'],
					default: 'auto',
					description:
						'"auto" compares against the union of all keys; "template" compares against one file.',
				},
				templatePath: {
					type: 'string',
					description:
						'Which file is the template. Required when mode is "template".',
				},
				caseSensitive: {
					type: 'boolean',
					default: true,
					description: 'Whether key names are compared case-sensitively.',
				},
				maxResults: MAX_RESULTS_SCHEMA,
			},
			required: ['files'],
			additionalProperties: false,
		},
		handler: compare,
	}),
]);
