import { mkdir, writeFile } from 'node:fs/promises';

const FIRST_MONTH = '2025-01';
const MAX_WINDOW_MONTHS = 12;

const monthAfter = (month, by = 1) => {
	const date = new Date(`${month}-01T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + by);
	return date.toISOString().slice(0, 7);
};

// Monthly tokens per model from the OpenRouter Data API, CC BY 4.0. Needs OPENROUTER_API_KEY in .env.
export const fetchOpenRouter = async () => {
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) throw new Error('OpenRouter: OPENROUTER_API_KEY is not set');
	const months = {};
	const programming = {};
	let asOf;
	const current = new Date().toISOString().slice(0, 7);
	const get = async (path, params) => {
		const response = await fetch(`https://openrouter.ai/api/v1/datasets/${path}?${new URLSearchParams(params)}`, {
			headers: { authorization: `Bearer ${key}`, 'user-agent': 'issoftwaresolved-index' },
		});
		if (!response.ok) throw new Error(`OpenRouter: HTTP ${response.status}`);
		return response.json();
	};
	for (let start = FIRST_MONTH; start <= current; start = monthAfter(start, MAX_WINDOW_MONTHS)) {
		const end = new Date(`${monthAfter(start, MAX_WINDOW_MONTHS)}-01T00:00:00Z`);
		end.setUTCDate(0);
		const window = { start_date: `${start}-01`, end_date: end.toISOString().slice(0, 10), period: 'month' };
		const { data, meta } = await get('rankings-daily', window);
		asOf = meta.as_of;
		for (const { date, model_permaslug: model, total_tokens: tokens } of data) {
			const month = date.slice(0, 7);
			(months[month] ??= {})[model] = Number(tokens);
		}
		// The sampled category data can include a partial month before the window, so that is left out.
		for (const { date, total_tokens: tokens } of (await get('rankings-daily', { ...window, category: 'programming' })).data) {
			const month = date.slice(0, 7);
			if (month >= start) programming[month] = (programming[month] ?? 0) + Number(tokens);
		}
	}
	const coding = {};
	for (let month = FIRST_MONTH; month < current; month = monthAfter(month)) {
		const end = new Date(`${monthAfter(month)}-01T00:00:00Z`);
		end.setUTCDate(0);
		const { data } = await get('app-rankings', { start_date: `${month}-01`, end_date: end.toISOString().slice(0, 10), category: 'coding' });
		coding[month] = Object.fromEntries(data.map(({ app_name: name, total_tokens: tokens }) => [name, Number(tokens)]));
		await new Promise((resolve) => setTimeout(resolve, 2500));
	}
	await mkdir('data/raw/openrouter', { recursive: true });
	await writeFile('data/raw/openrouter/monthly.json', `${JSON.stringify({ asOf, months, programming, coding })}\n`);
	console.log(`OpenRouter: ${Object.keys(months).length} months`);
};
