import * as vscode from 'vscode';
import type { readConfig } from '../config/config';
import type { Configuration } from '../interfaces';
import type { StatusBar } from '../interfaces/statusBar';
import type { SyncStatus } from '../types';

interface VSCodeDependencies {
	window: typeof vscode.window;
	StatusBarAlignment: typeof vscode.StatusBarAlignment;
	ThemeColor: typeof vscode.ThemeColor;
	onDidChangeConfiguration: typeof vscode.workspace.onDidChangeConfiguration;
	readConfig: typeof readConfig;
}

export function createVSCodeStatusBar(
	context: vscode.ExtensionContext,
	deps: VSCodeDependencies,
	configuration: Configuration,
): StatusBar {
	const statusBarItem = deps.window.createStatusBarItem(
		deps.StatusBarAlignment.Left,
		100,
	);
	context.subscriptions.push(statusBarItem);

	let lastStatus: SyncStatus = 'no-files';
	let lastIssueCount = 0;

	function render(): void {
		const config = deps.readConfig(configuration);

		if (!config.statusBarEnabled || shouldHideStatusBar(lastStatus)) {
			statusBarItem.hide();
			return;
		}

		applyStatusConfiguration(statusBarItem, lastStatus, lastIssueCount, deps);
		statusBarItem.show();
	}

	function updateStatus(status: SyncStatus, issueCount: number): void {
		lastStatus = status;
		lastIssueCount = issueCount;
		render();
	}

	// The item was previously rendered once from a config snapshot;
	// toggling statusBar.enabled did nothing until reload.
	context.subscriptions.push(
		deps.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('envsync-le.statusBar.enabled')) {
				render();
			}
		}),
	);

	function dispose(): void {
		statusBarItem.dispose();
	}

	return Object.freeze({
		updateStatus,
		dispose,
	});
}

function shouldHideStatusBar(status: SyncStatus): boolean {
	return status === 'no-files';
}

function applyStatusConfiguration(
	statusBarItem: vscode.StatusBarItem,
	status: SyncStatus,
	issueCount: number,
	deps: VSCodeDependencies,
): void {
	if (status === 'in-sync') {
		configureInSyncStatus(statusBarItem);
		return;
	}

	if (status === 'missing-keys' || status === 'extra-keys') {
		configureOutOfSyncStatus(statusBarItem, issueCount, deps);
		return;
	}

	if (status === 'parse-error') {
		configureErrorStatus(statusBarItem, issueCount, deps);
		return;
	}
}

function configureInSyncStatus(statusBarItem: vscode.StatusBarItem): void {
	statusBarItem.text = '$(file) 0';
	statusBarItem.tooltip = vscode.l10n.t('All dotenv files are in sync');
	statusBarItem.backgroundColor = undefined;
	statusBarItem.command = undefined;
}

function configureOutOfSyncStatus(
	statusBarItem: vscode.StatusBarItem,
	issueCount: number,
	deps: VSCodeDependencies,
): void {
	statusBarItem.text = `$(file) ${issueCount}`;
	statusBarItem.tooltip = vscode.l10n.t(
		'Dotenv files out of sync - click for details',
	);
	statusBarItem.backgroundColor = new deps.ThemeColor(
		'statusBarItem.warningBackground',
	);
	statusBarItem.command = 'envsync-le.showIssues';
}

function configureErrorStatus(
	statusBarItem: vscode.StatusBarItem,
	issueCount: number,
	deps: VSCodeDependencies,
): void {
	const displayCount = issueCount > 0 ? issueCount : '';

	statusBarItem.text = `$(file) ${displayCount}`;
	statusBarItem.tooltip = vscode.l10n.t(
		'Error checking dotenv files - click for details',
	);
	statusBarItem.backgroundColor = new deps.ThemeColor(
		'statusBarItem.errorBackground',
	);
	statusBarItem.command = 'envsync-le.showIssues';
}
