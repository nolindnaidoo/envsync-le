/**
 * The `envsync-le` npm binary: the Rust CLI's surface over the extension's
 * detection engine. `envsync-le mcp` serves the crate's two tools over stdio.
 */
import { name, version } from '../mcp/info';
import { TOOLS } from '../mcp/tools';
import { serve } from '../mcp/transport';
import { CHECK_TOOL } from './checkTool';
import { run } from './run';

/**
 * Waits for stdout to drain before exiting: `process.exit` on a pipe can cut
 * off the report still buffered, and a truncated JSON line is worse than none.
 */
function exitWith(code: number): void {
	process.stdout.write('', () => process.exit(code));
}

function main(args: readonly string[]): void {
	if (args[0] === 'mcp') {
		serve({ name, version }, [...TOOLS, CHECK_TOOL]);
		return;
	}
	exitWith(
		run(args, {
			stdout: (text) => process.stdout.write(text),
			stderr: (text) => process.stderr.write(text),
			stdoutIsTerminal: process.stdout.isTTY === true,
			version,
		}),
	);
}

main(process.argv.slice(2));
