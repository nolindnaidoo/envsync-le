import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Uri, workspace } from 'vscode'
import { createVSCodeFileSystem } from './vscodeFileSystem'

const FileType = { File: 1, Directory: 2 }

describe('createVSCodeFileSystem', () => {
	const fsAdapter = () =>
		createVSCodeFileSystem({
			Uri: Uri as any,
			workspaceFs: workspace.fs as any,
			findFiles: workspace.findFiles as any,
			asRelativePath: workspace.asRelativePath as any,
			FileType,
		})

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it('findFiles: returns mapped FileInfo list', async () => {
		;(workspace.findFiles as any).mockResolvedValue([
			Uri.file('/root/folder/.env'),
			Uri.file('/root/folder/.env.local'),
		])

		const fs = fsAdapter()
		const files = await fs.findFiles('**/.env*')
		expect(files).toEqual([
			{ filepath: '/root/folder/.env', uri: 'file:///root/folder/.env' },
			{ filepath: '/root/folder/.env.local', uri: 'file:///root/folder/.env.local' },
		])
	})

	it('readFile: decodes Uint8Array as utf8', async () => {
		const text = 'HELLO=world\n'
		;(workspace.fs.readFile as any).mockResolvedValue(Buffer.from(text, 'utf8'))

		const fs = fsAdapter()
		const result = await fs.readFile('/root/folder/.env')
		expect(result).toBe(text)
		expect(workspace.fs.readFile).toHaveBeenCalledWith(expect.objectContaining({ fsPath: '/root/folder/.env' }))
	})

	it('readFile: propagates errors for missing files', async () => {
		;(workspace.fs.readFile as any).mockRejectedValue(new Error('ENOENT'))
		const fs = fsAdapter()
		await expect(fs.readFile('/missing.env')).rejects.toThrow('ENOENT')
	})

	it('getFileStats: maps vscode stats to FileStats', async () => {
		;(workspace.fs.stat as any).mockResolvedValue({ mtime: 1234, size: 42, type: FileType.File })
		const fs = fsAdapter()
		const stat = await fs.getFileStats('/root/folder/.env')
		expect(stat.size).toBe(42)
		expect(stat.mtime).toEqual(new Date(1234))
		expect(stat.isFile).toBe(true)
		expect(stat.isDirectory).toBe(false)
	})

	it('fileExists: returns true when stat type indicates File', async () => {
		;(workspace.fs.stat as any).mockResolvedValue({ mtime: 0, size: 0, type: FileType.File })
		const fs = fsAdapter()
		await expect(fs.fileExists('/root/folder/.env')).resolves.toBe(true)
	})

	it('fileExists: returns false when stat throws', async () => {
		;(workspace.fs.stat as any).mockRejectedValue(new Error('ENOENT'))
		const fs = fsAdapter()
		await expect(fs.fileExists('/missing.env')).resolves.toBe(false)
	})

	it('asRelativePath: defers to workspace.asRelativePath', () => {
		;(workspace.asRelativePath as any).mockReturnValue('folder/.env')
		const fs = fsAdapter()
		expect(fs.asRelativePath('/root/folder/.env')).toBe('folder/.env')
		expect(workspace.asRelativePath).toHaveBeenCalled()
	})
})
