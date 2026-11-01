import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

const API = 'https://registry.modelcontextprotocol.io/v0/servers';
const META = 'io.modelcontextprotocol.registry/official';
const DELAY = 300;

// Only the first publish month of each server name is kept.
export const fetchMcpRegistry = async () => {
	const firstPublished = new Map();
	let entries = 0;
	let cursor;
	do {
		const url = `${API}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
		const { servers, metadata } = await (await request(url)).json();
		for (const { server, _meta } of servers) {
			const { publishedAt, status } = _meta[META];
			entries++;
			if (status === 'deleted') continue;
			const known = firstPublished.get(server.name);
			if (!known || publishedAt < known) firstPublished.set(server.name, publishedAt);
		}
		cursor = metadata.nextCursor;
		await new Promise((resolve) => setTimeout(resolve, DELAY));
	} while (cursor);
	const months = {};
	for (const date of firstPublished.values()) {
		const month = date.slice(0, 7);
		months[month] = (months[month] ?? 0) + 1;
	}
	await mkdir('data/raw/mcp-registry', { recursive: true });
	await writeFile('data/raw/mcp-registry/monthly.json', `${JSON.stringify({ entries, months }, null, '\t')}\n`);
	console.log(`MCP Registry: ${firstPublished.size} servers from ${entries} entries`);
};
