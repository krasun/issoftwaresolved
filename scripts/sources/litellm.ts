import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

const PATH = 'data/raw/litellm/monthly.json';
const FILE = 'model_prices_and_context_window.json';
const REPO = 'BerriAI/litellm';
const FIRST_MONTH = '2023-09';

// Companies selling their own models, so resellers don't count the same model many times.
const PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'vertex_ai-language-models', 'mistral', 'xai', 'deepseek', 'cohere_chat']);

// Only the fields read here. Entries without them are filtered out before use.
interface Price {
	mode: string;
	litellm_provider: string;
	input_cost_per_token: number;
	output_cost_per_token: number;
}
interface Month {
	median: number;
	lowest: number;
	models: number;
	prices: Record<string, [number, number]>;
}

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

// Reads the price file as it was at the start of each month, using its git history.
export const fetchLitellm = async () => {
	let saved: Record<string, Month> = {};
	try {
		saved = JSON.parse(await readFile(PATH, 'utf8'));
	} catch {}
	await mkdir('data/raw/litellm', { recursive: true });

	const now = new Date();
	const months: string[] = [];
	for (let date = new Date(`${FIRST_MONTH}-01T00:00:00Z`); date <= now; date.setUTCMonth(date.getUTCMonth() + 1)) {
		months.push(date.toISOString().slice(0, 7));
	}
	for (const month of months) {
		if (saved[month]?.prices) continue;
		const commits = (await (
			await request(`https://api.github.com/repos/${REPO}/commits?path=${FILE}&until=${month}-01T00:00:00Z&per_page=1`)
		).json()) as { sha: string }[];
		if (!commits[0]) continue;
		const prices = (await (await request(`https://raw.githubusercontent.com/${REPO}/${commits[0].sha}/${FILE}`)).json()) as Record<string, Price>;
		const costs = Object.entries(prices)
			.filter(([name, { mode, input_cost_per_token }]) => name !== 'sample_spec' && mode === 'chat' && input_cost_per_token > 0)
			.map(([, { input_cost_per_token }]) => input_cost_per_token * 1_000_000);
		const direct = Object.entries(prices).filter(
			([name, { mode, litellm_provider, input_cost_per_token, output_cost_per_token }]) =>
				name !== 'sample_spec' && mode === 'chat' && PROVIDERS.has(litellm_provider) && input_cost_per_token > 0 && output_cost_per_token > 0,
		);
		saved[month] = {
			median: median(costs),
			lowest: Math.min(...costs),
			models: costs.length,
			prices: Object.fromEntries(
				direct.map(([name, { input_cost_per_token, output_cost_per_token }]) => [
					name.replace(/^(gemini|xai|mistral|deepseek)\//, ''),
					[input_cost_per_token * 1_000_000, output_cost_per_token * 1_000_000],
				]),
			),
		};
		await writeFile(PATH, `${JSON.stringify(saved, null, '\t')}\n`);
	}
	console.log(`LiteLLM: ${Object.keys(saved).length} months`);
};
