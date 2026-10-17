/**
 * The `envsync-le` npm binary: the Rust CLI's surface over the extension's
 * detection engine. `envsync-le mcp` serves the crate's two tools over stdio.
 */
import { name, version } from '../mcp/info';
import { TOOLS } from '../mcp/tools';
import { serve } from '../mcp/transport';
import { CHECK_TOOL } from './checkTool';
import { crateOutput } from './output';
import { run } from './run';

function main(args: readonly string[]): void {
	const output = crateOutput(name);
	if (args[0] === 'mcp') {
		// The crate's server stops at the first reply it cannot write.
		process.stdout.once('error', () => output.exit(2, null));
		serve({ name, version }, [...TOOLS, CHECK_TOOL]);
		return;
	}
	output.exit(
		run(args, {
			stdout: output.stdout,
			stderr: output.stderr,
			stdoutIsTerminal: process.stdout.isTTY === true,
			version,
		}),
		'could not write the report',
	);
}

main(process.argv.slice(2));
