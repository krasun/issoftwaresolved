import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

const PATH = 'data/raw/agent-prs/monthly.json';
const FIRST_MONTH = '2024-12';
// Unauthenticated search allows 10 requests per minute.
const DELAY = 7000;
const QUERIES = {
	Codex: 'head:codex/',
	Copilot: 'author:app/copilot-swe-agent',
	Devin: 'author:app/devin-ai-integration',
	Cursor: 'author:app/cursor',
	Claude: 'author:app/claude',
	Jules: 'author:app/google-labs-jules',
	all: '',
};

// Only monthly counts are kept. Earlier months are saved, so a refresh only asks for the latest two.
export const fetchAgentPrs = async () => {
	const saved = await readFile(PATH, 'utf8').then(JSON.parse).catch(() => ({}));
	await mkdir('data/raw/agent-prs', { recursive: true });
	const now = new Date().toISOString().slice(0, 7);
	for (const date = new Date(`${FIRST_MONTH}-01T00:00:00Z`); date.toISOString().slice(0, 7) <= now; date.setUTCMonth(date.getUTCMonth() + 1)) {
		const month = date.toISOString().slice(0, 7);
		const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
		const recent = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 1)).toISOString().slice(0, 7) >= now;
		if (saved[month] && !recent) continue;
		const counts = {};
		for (const [name, filter] of Object.entries(QUERIES)) {
			const query = encodeURIComponent(`is:pr ${filter} created:${month}-01..${last}`);
			const { total_count, incomplete_results } = await (await request(`https://api.github.com/search/issues?q=${query}&per_page=1`)).json();
			if (incomplete_results) throw new Error(`Agent PRs: incomplete results for ${name} in ${month}`);
			counts[name] = total_count;
			await new Promise((resolve) => setTimeout(resolve, DELAY));
		}
		saved[month] = counts;
		await writeFile(PATH, `${JSON.stringify(saved, null, '\t')}\n`);
	}
	console.log(`Agent PRs: ${Object.keys(saved).length} months`);
};
