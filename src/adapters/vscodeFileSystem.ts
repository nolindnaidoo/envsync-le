import type { Uri, FileSystem as VSCodeFileSystemAPI } from 'vscode'; // Import types
import type { FileInfo, FileStats, FileSystem } from '../interfaces';

interface VSCodeDependencies {
	Uri: typeof Uri;
	workspaceFs: VSCodeFileSystemAPI;
	findFiles: (
		pattern: string,
		exclude?: string | null,
		maxResults?: number,
	) => Promise<Uri[]>;
	asRelativePath: (pathOrUri: string | Uri) => string;
	FileType: { File: number; Directory: number };
}

export function createVSCodeFileSystem(deps: VSCodeDependencies): FileSystem {
	return {
		async findFiles(
			pattern: string,
			exclude?: string | null,
			maxResults?: number,
		): Promise<FileInfo[]> {
			const uris = await deps.findFiles(pattern, exclude, maxResults);
			return uris.map((uri) => ({
				filepath: uri.fsPath,
				uri: uri.toString(),
			}));
		},

		async readFile(filepath: string): Promise<string> {
			const uri = deps.Uri.file(filepath);
			return decodeUtf8(await deps.workspaceFs.readFile(uri));
		},

		async getFileStats(filepath: string): Promise<FileStats> {
			const uri = deps.Uri.file(filepath);
			const stat = await deps.workspaceFs.stat(uri);
			return {
				mtime: new Date(stat.mtime),
				size: stat.size,
				isFile: (stat.type & deps.FileType.File) !== 0,
				isDirectory: (stat.type & deps.FileType.Directory) !== 0,
			};
		},

		asRelativePath(filepath: string): string {
			return deps.asRelativePath(filepath);
		},

		async fileExists(filepath: string): Promise<boolean> {
			try {
				const uri = deps.Uri.file(filepath);
				const stat = await deps.workspaceFs.stat(uri);
				return (stat.type & deps.FileType.File) !== 0;
			} catch {
				return false;
			}
		},
	};
}

/**
 * The file as text, or a refusal in the words the CLI uses.
 *
 * A lenient decode turned a Latin-1 or UTF-16 file into text full of
 * replacement characters, which the parser then reported line by line as
 * keys it could not read, so the user was told a key was malformed in a
 * file that was never text. The leading byte order mark is dropped, as the
 * CLI drops it and as the editor does before it shows a document.
 */
function decodeUtf8(bytes: Uint8Array): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		throw new Error('not UTF-8 text');
	}
}
