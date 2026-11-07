import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const USER_AGENT = 'issoftwaresolved-index';

export const request = async (url: string, attempts = 3, init: RequestInit = {}): Promise<Response> => {
	for (let attempt = 1; ; attempt++) {
		try {
			const response = await fetch(url, { ...init, headers: { 'user-agent': USER_AGENT, ...init.headers } });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response;
		} catch (error) {
			if (attempt >= attempts) throw new Error(`${url}: ${(error as Error).message}`);
			await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
		}
	}
};

export const download = async (url: string, path: string) => {
	await mkdir(dirname(path), { recursive: true });
	const { body } = await request(url);
	await pipeline(Readable.fromWeb(body as ReadableStream), createWriteStream(path));
};

// Large sources are kept as gzipped JSON lines, one record per line.
export const writeRecords = async (path: string, records: AsyncIterable<unknown> | Iterable<unknown>) => {
	await mkdir(dirname(path), { recursive: true });
	const lines = async function* () {
		for await (const record of records) yield `${JSON.stringify(record)}\n`;
	};
	await pipeline(Readable.from(lines()), createGzip(), createWriteStream(path));
};

export const parseCsv = (text: string): Record<string, string>[] => {
	const rows: string[][] = [[]];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') (field += '"'), i++;
			else if (char === '"') quoted = false;
			else field += char;
		} else if (char === '"') quoted = true;
		else if (char === ',') rows.at(-1)!.push(field), (field = '');
		else if (char === '\n') rows.at(-1)!.push(field), (field = ''), rows.push([]);
		else if (char !== '\r') field += char;
	}
	const [header, ...body] = rows;
	return body.filter((row) => row.length === header.length).map((row) =>
		Object.fromEntries(header.map((name, i) => [name, row[i]])),
	);
};
