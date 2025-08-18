import type { DotenvFile, KeyMismatch, SyncReport, SyncStatus } from '../types'

interface CompareOptions {
	mode?: 'auto' | 'template'
	templatePath?: string
}

export function compareFiles(files: readonly DotenvFile[], options?: CompareOptions): SyncReport {
	if (files.length === 0) {
		return {
			status: 'no-files',
			files: Object.freeze([]),
			missingKeys: Object.freeze([]),
			extraKeys: Object.freeze([]),
			errors: Object.freeze([]),
			lastChecked: Date.now(),
		}
	}

	// Determine reference keys
	const allKeys = new Set<string>()
	if (options?.mode === 'template' && options.templatePath) {
		const template = files.find((f) => f.path === options.templatePath)
		if (template) {
			for (const key of template.keys) allKeys.add(key)
		} else {
			// Fallback to union if template not found
			for (const file of files) for (const key of file.keys) allKeys.add(key)
		}
	} else {
		for (const file of files) for (const key of file.keys) allKeys.add(key)
	}

	const missingKeys: KeyMismatch[] = []
	const extraKeys: KeyMismatch[] = []

	// Find missing keys in each file
	for (const file of files) {
		const fileKeys = new Set(file.keys)
		const missing: string[] = []

		for (const key of allKeys) {
			if (!fileKeys.has(key)) {
				missing.push(key)
			}
		}

		if (missing.length > 0) {
			// Find a reference file that has these keys
			const referenceFile = files.find((f) => f.path !== file.path && missing.every((k) => f.keys.includes(k)))

			missingKeys.push({
				filepath: file.path,
				keys: Object.freeze([...missing]),
				reference: referenceFile?.path ?? 'other files',
			})
		}
	}

	// Determine overall status
	let status: SyncStatus = 'in-sync'
	if (missingKeys.length > 0) {
		status = 'missing-keys'
	}

	return {
		status,
		files: Object.freeze([...files]),
		missingKeys: Object.freeze(missingKeys),
		extraKeys: Object.freeze(extraKeys),
		errors: Object.freeze([]),
		lastChecked: Date.now(),
	}
}

export function areFilesInSync(files: readonly DotenvFile[]): boolean {
	if (files.length <= 1) return true

	const firstFileKeys = new Set(files[0]?.keys ?? [])

	return files.slice(1).every((file) => {
		const fileKeys = new Set(file.keys)

		// Check same number of keys
		if (firstFileKeys.size !== fileKeys.size) return false

		// Check all keys match
		for (const key of firstFileKeys) {
			if (!fileKeys.has(key)) return false
		}

		return true
	})
}
