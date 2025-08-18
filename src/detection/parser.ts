import { parse } from 'dotenv'
import type { DotenvFileType, ParseResult } from '../types'

export function parseDotenvFile(content: string, filepath: string): ParseResult {
	try {
		const parsed = parse(content)
		const keys = Object.keys(parsed)

		return {
			success: true,
			keys: Object.freeze(keys),
			errors: Object.freeze([]),
		}
	} catch (error) {
		return {
			success: false,
			keys: Object.freeze([]),
			errors: Object.freeze([
				{
					type: 'parse-error',
					message: `Failed to parse ${filepath}: ${(error as Error).message}`,
					filepath,
				},
			]),
		}
	}
}

export function detectFileType(filepath: string): DotenvFileType {
	const filename = filepath.split('/').pop() ?? ''

	if (filename === '.env') return 'base'
	if (filename.includes('.local')) return 'local'
	if (filename.includes('.example') || filename.includes('.template')) return 'example'
	if (filename.includes('.production') || filename.includes('.prod')) return 'production'
	if (filename.includes('.development') || filename.includes('.dev')) return 'development'
	if (filename.includes('.test')) return 'test'

	return 'base' // fallback
}

export function shouldExcludeFile(filepath: string, excludePatterns: readonly string[]): boolean {
	// Match against full relative path. Support '*' and '**' segments.
	return excludePatterns.some((pattern) => matchSimpleGlob(filepath, pattern))
}

function matchSimpleGlob(input: string, pattern: string): boolean {
	const escaped = pattern.replace(/[.+?^${}()|[\\]/g, '\\$&')
	const DOUBLE_STAR = '\u0000'
	const withMarker = escaped.replace(/\*\*/g, DOUBLE_STAR)
	const singleExpanded = withMarker.replace(/\*/g, '[^/]*')
	const regexStr = `^${singleExpanded.replace(new RegExp(DOUBLE_STAR, 'g'), '.*')}$`
	return new RegExp(regexStr).test(input)
}
