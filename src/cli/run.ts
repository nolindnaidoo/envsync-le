/**
 * The terminal surface, as the Rust CLI's `cli.rs` runs it.
 *
 * stdout is protocol: one JSON report for the whole run whenever something
 * is reading it, and nothing when it is a terminal, because the stderr
 * summary already says every mismatch a person reads there.
 */
import { parse } from './args';
import { exitCode, type Report, scan, scanPaths } from './scan';
import { USAGE } from './usage';

export interface RunIo {
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly stdoutIsTerminal: boolean;
	readonly version: string;
}

export function run(args: readonly string[], io: RunIo): number {
	const first = args[0];
	if (first === '--help' || first === '-h') {
		io.stdout(`${USAGE}\n`);
		return 0;
	}
	if (first === '--version' || first === '-V') {
		io.stdout(`envsync-le ${io.version}\n`);
		return 0;
	}

	try {
		return execute(args, io);
	} catch (error) {
		io.stderr(
			`envsync-le: ${error instanceof Error ? error.message : String(error)}\n`,
		);
		return 2;
	}
}

function execute(args: readonly string[], io: RunIo): number {
	const options = parse(args);
	const report =
		options.files.length === 0
			? scan(options.root, options.scan)
			: scanPaths(options.files, options.root, options.scan);

	if (!io.stdoutIsTerminal) io.stdout(`${JSON.stringify(report)}\n`);
	io.stderr(summary(report));
	return exitCode(report, options.strict);
}

/** The human half. Every line restates something already on stdout. */
function summary(report: Report): string {
	const lines: string[] = [];
	for (const diagnostic of report.diagnostics) {
		lines.push(`${diagnostic.file}: ${diagnostic.message}`);
	}
	for (const entry of report.missingKeys) {
		lines.push(
			`${entry.filepath}: missing ${entry.keys.join(', ')} (in ${entry.reference})`,
		);
	}
	for (const entry of report.extraKeys) {
		lines.push(
			`${entry.filepath}: extra ${entry.keys.join(', ')} (not in ${entry.reference})`,
		);
	}
	lines.push(verdict(report));
	return lines.map((line) => `${line}\n`).join('');
}

function verdict(report: Report): string {
	if (report.status === 'no-files') return 'no dotenv files found';
	const files = plural(report.summary.files, 'file', 'files');
	if (report.status === 'in-sync') return `in sync — ${files}`;
	// Files, not entries: one file missing two keys and holding one extra is
	// one file with mismatches, not three.
	const mismatched = new Set(
		[...report.missingKeys, ...report.extraKeys].map((entry) => entry.filepath),
	).size;
	return `out of sync — ${plural(mismatched, 'file with mismatches', 'files with mismatches')} across ${files}`;
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}
