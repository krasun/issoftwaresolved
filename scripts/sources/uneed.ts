import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

export interface UneedMonth {
	month: string;
	complete: boolean;
	launched: number;
	submitted: number | null;
	declined: number | null;
	estimated: boolean;
}

// Validate before replacing the cache; missing observations must never become zeros.
export function parseUneedMonths(data: unknown): UneedMonth[] {
	const months = (data as { months?: unknown })?.months;
	if (!Array.isArray(months) || !months.length) throw new Error('Uneed: missing months');
	const seen = new Set<string>();
	for (const row of months) {
		if (!row || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || seen.has(row.month)
			|| typeof row.complete !== 'boolean' || typeof row.estimated !== 'boolean'
			|| !Number.isSafeInteger(row.launched) || row.launched < 0
			|| !['submitted', 'declined'].every(key => row[key] === null || (Number.isSafeInteger(row[key]) && row[key] >= 0))) {
			throw new Error('Uneed: invalid monthly counts');
		}
		seen.add(row.month);
	}
	return months.map(({ month, complete, launched, submitted, declined, estimated }) =>
		({ month, complete, launched, submitted, declined, estimated })).sort((a, b) => a.month.localeCompare(b.month));
}

export const fetchUneed = async () => {
	const data = await (await request('https://mcp.uneed.best/v1/stats/launches')).json();
	const months = parseUneedMonths(data);
	await mkdir('data/raw/uneed', { recursive: true });
	await writeFile('data/raw/uneed/monthly.json', `${JSON.stringify({ months }, null, '\t')}\n`);
	console.log(`Uneed: ${months.length} months`);
};
