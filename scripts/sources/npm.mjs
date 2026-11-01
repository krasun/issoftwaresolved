import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

const DAY = 86_400_000;
const FIRST_DAY = Date.parse('2015-01-10');
// The API returns at most 18 months per request.
const WINDOW = 540 * DAY;

export const fetchNpm = async () => {
	const months = {};
	const today = Date.now() - DAY;
	for (let start = FIRST_DAY; start < today; start += WINDOW + DAY) {
		const from = new Date(start).toISOString().slice(0, 10);
		const to = new Date(Math.min(start + WINDOW, today)).toISOString().slice(0, 10);
		const { downloads } = await (await request(`https://api.npmjs.org/downloads/range/${from}:${to}`)).json();
		for (const { day, downloads: count } of downloads) {
			const month = day.slice(0, 7);
			months[month] = (months[month] ?? 0) + count;
		}
	}
	await mkdir('data/raw/npm', { recursive: true });
	await writeFile('data/raw/npm/monthly.json', `${JSON.stringify(months, null, '\t')}\n`);
	console.log(`npm: ${Object.keys(months).length} months`);
};
