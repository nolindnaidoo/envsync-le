/**
 * An operating-system error as Rust's `io::Error` prints it.
 *
 * The Rust CLI names a failed read as `Permission denied (os error 13)`, and
 * those words reach stderr and the JSON report's `skipped` diagnostic. Node
 * prints libuv's text instead (`EACCES: permission denied, open 'x'`), so the
 * two `envsync-le` binaries would disagree about the same file. strerror's
 * wording is spelled out for the errors a walk meets; anything else keeps
 * libuv's text, capitalised, which is the closest available without a guess.
 */
const STRERROR: Readonly<Record<string, string>> = Object.freeze({
	ENOENT: 'No such file or directory',
	EACCES: 'Permission denied',
	EPERM: 'Operation not permitted',
	ENOTDIR: 'Not a directory',
	EISDIR: 'Is a directory',
	ELOOP: 'Too many levels of symbolic links',
	ENAMETOOLONG: 'File name too long',
	EBUSY: 'Resource busy',
	EIO: 'Input/output error',
});

const INVALID_UTF8 = 'INVALID_UTF8';

export function decodeUtf8OrThrow(bytes: Uint8Array): string {
	try {
		return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
			bytes,
		);
	} catch {
		throw Object.assign(new Error('stream did not contain valid UTF-8'), {
			code: INVALID_UTF8,
		});
	}
}

/**
 * Drop a leading byte-order mark. Notepad, Excel and a PowerShell redirect add
 * one, and VS Code strips it before the extension sees a document, so a file
 * read without this reads differently from the same file open in the editor.
 */
export function withoutBom(content: string): string {
	return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

export function rustIoMessage(error: unknown): string {
	const code = codeOf(error);
	// Rust's own wording, which carries no OS error number.
	if (code === INVALID_UTF8) return 'stream did not contain valid UTF-8';
	const errno = errnoOf(error);
	const text = (code && STRERROR[code]) || libuvText(error);
	if (errno === undefined) return text;
	return `${text} (os error ${errno})`;
}

function codeOf(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === 'string' ? code : undefined;
}

function errnoOf(error: unknown): number | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const errno = (error as { errno?: unknown }).errno;
	return typeof errno === 'number' ? Math.abs(errno) : undefined;
}

function libuvText(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	const described = message.replace(/^[A-Z]+: /, '').replace(/, \w+ '.*'$/, '');
	return described.charAt(0).toUpperCase() + described.slice(1);
}
