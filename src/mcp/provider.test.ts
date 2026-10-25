import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	_createExtensionContext,
	_mcpProviders,
	_resetMockState,
	_setLmApi,
	McpStdioServerDefinition,
} from '../__mocks__/vscode';
import { registerMcpProvider } from './provider';

/**
 * The README says a VS Code with agent mode needs nothing installed: the
 * extension registers the bundled server. The mock had no `vscode.lm`, so
 * the registration ran in no test and the claim rested on reading the code.
 */

beforeEach(() => {
	_resetMockState();
});

describe('the MCP server definition provider', () => {
	it('registers the bundled server with a host that has the API', () => {
		_setLmApi(true);
		const context = _createExtensionContext();
		const disposable = registerMcpProvider(context as never);
		expect(disposable).toBeDefined();
		expect(context.subscriptions).toContain(disposable);
		expect(_mcpProviders().map((entry) => entry.id)).toEqual(['envsync-le']);

		const definitions =
			_mcpProviders()[0]?.provider.provideMcpServerDefinitions();
		expect(Array.isArray(definitions)).toBe(true);
		const [definition] = definitions as McpStdioServerDefinition[];
		expect(definition).toBeInstanceOf(McpStdioServerDefinition);
		expect(definition?.label).toBe('EnvSync-LE');
		// The extension host is Electron, so the server runs under it as Node.
		expect(definition?.command).toBe(process.execPath);
		expect(definition?.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' });
		expect(definition?.args).toHaveLength(1);
		expect(definition?.args[0]).toMatch(/dist[\\/]mcp-server\.js$/);
		// The version lets the host notice an upgrade and refresh the tools.
		expect(definition?.version).toBe(context.extension.packageJSON.version);
	});

	it('declares the id the manifest declares', () => {
		const manifest = JSON.parse(
			readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
		) as { contributes: { mcpServerDefinitionProviders: { id: string }[] } };
		_setLmApi(true);
		registerMcpProvider(_createExtensionContext() as never);
		expect(_mcpProviders().map((entry) => entry.id)).toEqual(
			manifest.contributes.mcpServerDefinitionProviders.map((p) => p.id),
		);
	});

	it('says nothing in a host without the API', () => {
		_setLmApi(false);
		const context = _createExtensionContext();
		expect(registerMcpProvider(context as never)).toBeUndefined();
		expect(_mcpProviders()).toHaveLength(0);
		expect(context.subscriptions).toHaveLength(0);
	});
});
