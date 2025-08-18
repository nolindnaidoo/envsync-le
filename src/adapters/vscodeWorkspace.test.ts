import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Uri, workspace } from 'vscode'
import type { Workspace } from '../interfaces/workspace'
import { createVSCodeWorkspace } from './vscodeWorkspace'

describe('createVSCodeWorkspace', () => {
	let vscodeWorkspace: Workspace

	beforeEach(() => {
		vi.clearAllMocks()
	})

	const setupWorkspace = (folders: any[], isTrusted: boolean) => {
		// @ts-expect-error test mock assignment
		workspace.workspaceFolders = folders
		// @ts-expect-error test mock assignment
		workspace.isTrusted = isTrusted
		vscodeWorkspace = createVSCodeWorkspace()
	}

	it('should return the root path of the workspace', () => {
		setupWorkspace([{ uri: Uri.file('/root/folder'), name: 'test-workspace', index: 0 }], true)
		const rootPath = vscodeWorkspace.getRootPath()
		expect(rootPath).toBe('/root/folder')
	})

	it('should return undefined if there are no workspace folders', () => {
		setupWorkspace([], true)
		const rootPath = vscodeWorkspace.getRootPath()
		expect(rootPath).toBeUndefined()
	})

	it('should check if a file is within the workspace', () => {
		setupWorkspace([{ uri: Uri.file('/root/folder'), name: 'test-workspace', index: 0 }], true)
		const isInWorkspace = vscodeWorkspace.isInWorkspace('/root/folder/file.txt')
		expect(isInWorkspace).toBe(true)
	})

	it('should return false if file is outside workspace', () => {
		setupWorkspace([{ uri: Uri.file('/root/folder'), name: 'test-workspace', index: 0 }], true)
		const isInWorkspace = vscodeWorkspace.isInWorkspace('/another/folder/file.txt')
		expect(isInWorkspace).toBe(false)
	})

	it('should return false if there is no root path', () => {
		setupWorkspace([], true)
		const isInWorkspace = vscodeWorkspace.isInWorkspace('/root/folder/file.txt')
		expect(isInWorkspace).toBe(false)
	})

	it('should return the name of the workspace', () => {
		setupWorkspace([{ uri: Uri.file('/root/folder'), name: 'test-workspace', index: 0 }], true)
		const name = vscodeWorkspace.getName()
		expect(name).toBe('test-workspace')
	})

	it('should return "Unknown" if the workspace name is not available', () => {
		setupWorkspace([], true)
		const name = vscodeWorkspace.getName()
		expect(name).toBe('Unknown')
	})

	it('should check if the workspace is trusted', () => {
		setupWorkspace([{ uri: Uri.file('/root/folder'), name: 'test-workspace', index: 0 }], true)
		const isTrusted = vscodeWorkspace.isTrusted()
		expect(isTrusted).toBe(true)
	})

	it('should handle untrusted workspace', () => {
		setupWorkspace([{ uri: Uri.file('/root/folder'), name: 'test-workspace', index: 0 }], false)
		const isTrusted = vscodeWorkspace.isTrusted()
		expect(isTrusted).toBe(false)
	})

	it('should return false from isInWorkspace on error', () => {
		setupWorkspace([{ uri: Uri.file('/root/folder'), name: 'test-workspace', index: 0 }], true)
		vi.spyOn(workspace, 'asRelativePath').mockImplementation(() => {
			throw new Error('test error')
		})
		const isInWorkspace = vscodeWorkspace.isInWorkspace('/root/folder/file.txt')
		expect(isInWorkspace).toBe(false)
	})
})
