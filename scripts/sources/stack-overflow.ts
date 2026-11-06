import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

const PATH = 'data/raw/stack-overflow/monthly.json';
const FIRST_MONTH = '2019-01';
const DELAY = 1000;

// Only monthly totals are requested, no question content. Earlier months are saved.
export const fetchStackOverflow = async () => {
	const saved: Record<string, number> = await readFile(PATH, 'utf8').then(JSON.parse).catch(() => ({}));
	await mkdir('data/raw/stack-overflow', { recursive: true });
	const now = new Date().toISOString().slice(0, 7);
	for (const date = new Date(`${FIRST_MONTH}-01T00:00:00Z`); date.toISOString().slice(0, 7) <= now; date.setUTCMonth(date.getUTCMonth() + 1)) {
		const month = date.toISOString().slice(0, 7);
		const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
		const recent = end >= Date.parse(`${now}-01T00:00:00Z`);
		if (saved[month] !== undefined && !recent) continue;
		const url = `https://api.stackexchange.com/2.3/questions?site=stackoverflow&fromdate=${date.getTime() / 1000}&todate=${end / 1000 - 1}&filter=total`;
		saved[month] = ((await (await request(url)).json()) as { total: number }).total;
		await writeFile(PATH, `${JSON.stringify(saved, null, '\t')}\n`);
		await new Promise((resolve) => setTimeout(resolve, DELAY));
	}
	console.log(`Stack Overflow: ${Object.keys(saved).length} months`);
};
