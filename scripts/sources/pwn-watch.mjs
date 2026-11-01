import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

// pwn.watch publishes no license, so only the fields we count are kept, not its text or sources.
const FIELDS = ['category', 'status', 'severity', 'patchStatus', 'tags', 'cveIds', 'startedAt'];

export const fetchPwnWatch = async () => {
	const { generatedAt, incidents } = await (await request('https://pwn.watch/incidents.json')).json();
	const kept = incidents.map((incident) => Object.fromEntries(FIELDS.map((field) => [field, incident[field]])));
	await mkdir('data/raw/pwn-watch', { recursive: true });
	await writeFile('data/raw/pwn-watch/incidents.json', `${JSON.stringify({ generatedAt, incidents: kept })}\n`);
	console.log(`pwn.watch: ${kept.length} incidents`);
};
