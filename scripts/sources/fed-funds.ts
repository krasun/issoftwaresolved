import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

export const fetchFedFunds = async () => {
	const csv = await (await request('https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS')).text();
	const months: Record<string, number> = {};
	for (const line of csv.trim().split('\n').slice(1)) {
		const [date, rate] = line.split(',');
		if (rate) months[date.slice(0, 7)] = Number(rate);
	}
	await mkdir('data/raw/fed-funds', { recursive: true });
	await writeFile('data/raw/fed-funds/monthly.json', `${JSON.stringify(months, null, '\t')}\n`);
	console.log(`Fed funds: ${Object.keys(months).length} months`);
};
