import type { SyncStatus } from '../types'

export interface StatusBar {
	updateStatus(status: SyncStatus, issueCount: number): void
	dispose(): void
}
