import * as vscode from 'vscode';
import { readConfig } from '../config/config';
import type { Configuration } from '../interfaces';
import type { Telemetry } from '../interfaces/telemetry';

export function createVSCodeTelemetry(configuration: Configuration): Telemetry {
	let outputChannel: vscode.OutputChannel | undefined;

	function getOutputChannel(): vscode.OutputChannel {
		if (!outputChannel) {
			outputChannel = vscode.window.createOutputChannel('envsync-le');
		}
		return outputChannel;
	}

	function event(name: string, properties?: Record<string, string>): void {
		const config = readConfig(configuration);

		if (!config.telemetryEnabled) {
			return;
		}

		// Only create output channel when telemetry is actually enabled
		const timestamp = new Date().toISOString();
		const props = properties ? ` ${JSON.stringify(properties)}` : '';
		const logLine = `[${timestamp}] ${name}${props}`;

		getOutputChannel().appendLine(logLine);
	}

	function dispose(): void {
		outputChannel?.dispose();
	}

	return Object.freeze({
		event,
		dispose,
	});
}
