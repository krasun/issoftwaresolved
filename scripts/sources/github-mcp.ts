import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

// Anthropic announced MCP in November 2024.
const FIRST_MONTH = '2024-11';
// Unauthenticated search allows 10 requests per minute.
const DELAY = 7000;

interface Search {
	total_count: number;
	incomplete_results: boolean;
}

export const fetchGithubMcp = async () => {
	const months: Record<string, number> = {};
	const current = new Date().toISOString().slice(0, 7);
	for (let month = FIRST_MONTH; month <= current; ) {
		const date = new Date(`${month}-01T00:00:00Z`);
		date.setUTCMonth(date.getUTCMonth() + 1);
		const next = date.toISOString().slice(0, 7);
		date.setUTCDate(0);
		const range = `${month}-01..${date.toISOString().slice(0, 10)}`;
		const { total_count, incomplete_results } = (await (
			await request(`https://api.github.com/search/repositories?q=topic:mcp-server+created:${range}&per_page=1`)
		).json()) as Search;
		if (incomplete_results) throw new Error(`GitHub MCP: incomplete results for ${month}`);
		months[month] = total_count;
		month = next;
		await new Promise((resolve) => setTimeout(resolve, DELAY));
	}
	await mkdir('data/raw/github-mcp', { recursive: true });
	await writeFile('data/raw/github-mcp/monthly.json', `${JSON.stringify(months, null, '\t')}\n`);
	console.log(`GitHub MCP: ${Object.keys(months).length} months`);
};
