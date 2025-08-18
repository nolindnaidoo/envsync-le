import { describe, expect, it } from 'vitest'
import type { DotenvFile } from '../types'
import { areFilesInSync, compareFiles } from './comparator'

describe('compareFiles', () => {
	it('should handle empty file list', () => {
		const result = compareFiles([])

		expect(result.status).toBe('no-files')
		expect(result.files).toEqual([])
		expect(result.missingKeys).toEqual([])
		expect(result.extraKeys).toEqual([])
		expect(result.errors).toEqual([])
		expect(result.lastChecked).toBeGreaterThan(0)
	})

	it('should use template keys as reference in template mode', () => {
		const now = Date.now()
		const files: DotenvFile[] = [
			{ path: '.env.template', type: 'example', keys: ['K1', 'K2'], lastModified: now },
			{ path: '.env', type: 'base', keys: ['K1'], lastModified: now },
			{ path: '.env.local', type: 'local', keys: ['K1', 'K2', 'K3'], lastModified: now },
		]

		const result = compareFiles(files, { mode: 'template', templatePath: '.env.template' })

		// .env is missing K2 relative to template
		// .env.local has extra K3 but we only report missing relative to template today
		expect(result.status).toBe('missing-keys')
		const envMissing = result.missingKeys.find((m) => m.filepath === '.env')
		expect(envMissing?.keys).toEqual(['K2'])
	})

	it('should detect in-sync files', () => {
		const files: DotenvFile[] = [
			{ path: '.env', type: 'base', keys: ['KEY1', 'KEY2', 'KEY3'], lastModified: Date.now() },
			{ path: '.env.local', type: 'local', keys: ['KEY1', 'KEY2', 'KEY3'], lastModified: Date.now() },
			{ path: '.env.production', type: 'production', keys: ['KEY1', 'KEY2', 'KEY3'], lastModified: Date.now() },
		]

		const result = compareFiles(files)

		expect(result.status).toBe('in-sync')
		expect(result.files).toHaveLength(3)
		expect(result.missingKeys).toEqual([])
		expect(result.extraKeys).toEqual([])
	})

	it('should detect missing keys', () => {
		const files: DotenvFile[] = [
			{ path: '.env', type: 'base', keys: ['KEY1', 'KEY2', 'KEY3'], lastModified: Date.now() },
			{ path: '.env.local', type: 'local', keys: ['KEY1', 'KEY2'], lastModified: Date.now() },
			{ path: '.env.production', type: 'production', keys: ['KEY1', 'KEY2', 'KEY3', 'KEY4'], lastModified: Date.now() },
		]

		const result = compareFiles(files)

		expect(result.status).toBe('missing-keys')
		// Each file missing keys from others gets a missingKeys entry
		expect(result.missingKeys).toHaveLength(2)
		// .env.local is missing KEY3 and KEY4
		const localMissing = result.missingKeys.find((m) => m.filepath === '.env.local')
		expect(localMissing?.keys).toEqual(['KEY3', 'KEY4'])
		// .env is missing KEY4
		const baseMissing = result.missingKeys.find((m) => m.filepath === '.env')
		expect(baseMissing?.keys).toEqual(['KEY4'])
	})

	it('should handle files with completely different keys', () => {
		const files: DotenvFile[] = [
			{ path: '.env', type: 'base', keys: ['KEY1', 'KEY2'], lastModified: Date.now() },
			{ path: '.env.local', type: 'local', keys: ['KEY3', 'KEY4'], lastModified: Date.now() },
		]

		const result = compareFiles(files)

		expect(result.status).toBe('missing-keys')
		expect(result.missingKeys).toHaveLength(2)
		expect(result.missingKeys[0].keys).toEqual(['KEY3', 'KEY4'])
		expect(result.missingKeys[1].keys).toEqual(['KEY1', 'KEY2'])
	})

	it('should return frozen arrays for immutability', () => {
		const files: DotenvFile[] = [{ path: '.env', type: 'base', keys: ['KEY1'], lastModified: Date.now() }]

		const result = compareFiles(files)

		expect(Object.isFrozen(result.files)).toBe(true)
		expect(Object.isFrozen(result.missingKeys)).toBe(true)
		expect(Object.isFrozen(result.extraKeys)).toBe(true)
		expect(Object.isFrozen(result.errors)).toBe(true)
	})
})

describe('areFilesInSync', () => {
	it('should return true for empty file list', () => {
		expect(areFilesInSync([])).toBe(true)
	})

	it('should return true for single file', () => {
		const files: DotenvFile[] = [{ path: '.env', type: 'base', keys: ['KEY1', 'KEY2'], lastModified: Date.now() }]
		expect(areFilesInSync(files)).toBe(true)
	})

	it('should return true for identical files', () => {
		const files: DotenvFile[] = [
			{ path: '.env', type: 'base', keys: ['KEY1', 'KEY2'], lastModified: Date.now() },
			{ path: '.env.local', type: 'local', keys: ['KEY1', 'KEY2'], lastModified: Date.now() },
		]
		expect(areFilesInSync(files)).toBe(true)
	})

	it('should return false for different key counts', () => {
		const files: DotenvFile[] = [
			{ path: '.env', type: 'base', keys: ['KEY1', 'KEY2'], lastModified: Date.now() },
			{ path: '.env.local', type: 'local', keys: ['KEY1'], lastModified: Date.now() },
		]
		expect(areFilesInSync(files)).toBe(false)
	})

	it('should return false for different keys', () => {
		const files: DotenvFile[] = [
			{ path: '.env', type: 'base', keys: ['KEY1', 'KEY2'], lastModified: Date.now() },
			{ path: '.env.local', type: 'local', keys: ['KEY1', 'KEY3'], lastModified: Date.now() },
		]
		expect(areFilesInSync(files)).toBe(false)
	})

	it('should handle undefined keys gracefully', () => {
		const files: DotenvFile[] = [
			{ path: '.env', type: 'base', keys: ['KEY1', 'KEY2'], lastModified: Date.now() },
			{ path: '.env.local', type: 'local', keys: [], lastModified: Date.now() },
		]
		expect(areFilesInSync(files)).toBe(false)
	})
})
