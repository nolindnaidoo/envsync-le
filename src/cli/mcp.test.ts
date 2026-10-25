import { describe, expect, it } from 'vitest';
import { TOOLS } from '../mcp/tools';
import { serve } from './mcp';

/**
 * `envsync-le mcp` over its own loop, with a writer that behaves as a full
 * pipe does. The crate's loop writes with a blocking call, so a client that
 * reads slowly holds the crate's replies in the pipe; this loop waits on the
 * promise a full pipe answers with, and reads the next frame only after.
 */

const INFO = { name: 'envsync-le', version: '0.0.0' };
const ping = (id: number) =>
	Buffer.from(`{"jsonrpc":"2.0","id":${id},"method":"ping"}\n`);

async function* chunks(...frames: Buffer[]): AsyncGenerator<Uint8Array> {
	for (const frame of frames) yield frame;
}

describe('serve: a client that reads slowly', () => {
	it('waits for the pipe to drain before reading the next frame', async () => {
		const written: string[] = [];
		let release: (() => void) | undefined;
		const write = (line: string): Promise<void> | undefined => {
			written.push(line);
			if (release !== undefined) return undefined;
			return new Promise<void>((resolve) => {
				release = resolve;
			});
		};

		const done = serve(chunks(ping(1), ping(2)), write, INFO, TOOLS);
		await new Promise((r) => setTimeout(r, 20));
		expect(written).toHaveLength(1);

		release?.();
		expect(await done).toBe(0);
		expect(written).toHaveLength(2);
		expect(written.map((line) => JSON.parse(line).id)).toEqual([1, 2]);
	});

	it('answers every frame in order when the pipe never fills', async () => {
		const written: string[] = [];
		const code = await serve(
			chunks(ping(1), Buffer.from('not json\n'), ping(3)),
			(line) => {
				written.push(line);
				return undefined;
			},
			INFO,
			TOOLS,
		);
		expect(code).toBe(0);
		expect(written.map((line) => JSON.parse(line).id)).toEqual([1, null, 3]);
	});
});
