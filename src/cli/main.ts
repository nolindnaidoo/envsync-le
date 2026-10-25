/**
 * The `envsync-le` npm binary: the Rust CLI's surface over the extension's
 * detection engine. `envsync-le mcp` serves the crate's two tools over stdio.
 */
import { name, version } from '../mcp/info';
import { TOOLS } from '../mcp/tools';
import { CHECK_TOOL } from './checkTool';
import { serve } from './mcp';
import { crateOutput } from './output';
import { run } from './run';

function main(args: readonly string[]): void {
	const output = crateOutput(name);
	if (args[0] === 'mcp') {
		// The crate's server stops at the first reply it cannot write.
		process.stdout.once('error', () => output.exit(2, null));
		// A full pipe is waited out before the next frame is read, as the
		// crate's blocking write waits it out.
		const writeReply = (line: string): Promise<void> | undefined =>
			output.stdout(line)
				? undefined
				: new Promise((resolve) => process.stdout.once('drain', resolve));
		serve(process.stdin, writeReply, { name, version }, [
			...TOOLS,
			CHECK_TOOL,
		]).then((code) => output.exit(code, null));
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
