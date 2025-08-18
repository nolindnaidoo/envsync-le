import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import type { Detector } from '../detection/detector'
import type { FileSystem, UserInterface } from '../interfaces'
import type { Telemetry } from '../interfaces/telemetry'

const localize = nls.config({ messageFormat: nls.MessageFormat.file })()

export function registerShowIssuesCommand(
	context: vscode.ExtensionContext,
	deps: Readonly<{
		telemetry: Telemetry
		detector: Detector
		fileSystem: FileSystem
		ui: UserInterface
	}>,
): void {
	const { telemetry, detector, fileSystem } = deps

	context.subscriptions.push(
		vscode.commands.registerCommand('envsync-le.showIssues', async () => {
			telemetry.event('command', { name: 'showIssues' })

			const report = await detector.checkSync()

			if (report.status === 'no-files') {
				vscode.window.showInformationMessage(
					localize('runtime.message.no-env-files', 'No .env files found in workspace'),
				)
				return
			}

			if (report.status === 'in-sync') {
				vscode.window.showInformationMessage(localize('runtime.message.in-sync', 'Selected .env files are in sync'))
				return
			}

			// Build a Markdown summary of issues
			const lines: string[] = []
			const rel = (p: string) => fileSystem.asRelativePath(p)

			lines.push('# envsync-le Sync Report')
			lines.push('')
			lines.push(`- Checked files: ${report.files.length}`)
			lines.push(`- Status: ${report.status}`)
			lines.push('')

			if (report.missingKeys.length > 0) {
				lines.push('## Missing Keys')
				for (const m of report.missingKeys) {
					const file = rel(m.filepath)
					const ref = m.reference ? rel(m.reference) : 'other files'
					lines.push(`### ${file}`)
					lines.push(`Compared to: ${ref}`)
					lines.push('')
					for (const k of m.keys) {
						lines.push(`- ${k}`)
					}
					lines.push('')
				}
			}

			if (report.errors.length > 0) {
				lines.push('## Parse / Read Errors')
				for (const e of report.errors) {
					lines.push(`- ${rel(e.filepath)}: ${e.message}`)
				}
				lines.push('')
			}

			// Show as a temporary Markdown document
			const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' })
			await vscode.window.showTextDocument(doc, { preview: true })
		}),
	)
}
