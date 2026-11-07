import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

const API = 'https://api.producthunt.com/v2/api/graphql';
// Product Hunt opened in November 2013, and its launch days run on Pacific time.
const FIRST_MONTH = '2013-11';
const TIME_ZONE = 'America/Los_Angeles';
const MONTHS_PER_QUERY = 12;

export interface ProductHuntMonth {
	month: string;
	launched: number;
	featured: number;
}

const nextMonth = (month: string) => {
	const [year, m] = month.split('-').map(Number);
	return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
};

// Midnight on the first of the month in Pacific time, as an ISO timestamp with its offset.
// The offset is read at 08:00 UTC, the first hour of that day, because daylight saving can end later on 1 November
// and launches go live at 00:01, so an hour's error moves a whole day of launches.
export const monthStart = (month: string) => {
	const midnight = new Date(`${month}-01T08:00:00Z`);
	const offset = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
		.formatToParts(midnight).find(({ type }) => type === 'timeZoneName')!.value.replace('GMT', '');
	return `${month}-01T00:00:00${offset || '+00:00'}`;
};

// Complete months only: the current Pacific month is still filling up.
export const completeMonths = (now = new Date()) => {
	const current = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' }).format(now).slice(0, 7);
	const months: string[] = [];
	for (let month = FIRST_MONTH; month < current; month = nextMonth(month)) months.push(month);
	return months;
};

// Two counts per month: every post, and the posts Product Hunt featured on its home page.
const queryFor = (months: string[]) => `{${months.map((month, i) => {
	const range = `postedAfter: "${monthStart(month)}", postedBefore: "${monthStart(nextMonth(month))}", first: 1`;
	return ` all${i}: posts(${range}) { totalCount } featured${i}: posts(featured: true, ${range}) { totalCount }`;
}).join('')} }`;

// Validate before replacing the cache; a missing count must never become a zero.
export function parseProductHunt(months: string[], response: unknown): ProductHuntMonth[] {
	const { data, errors } = (response ?? {}) as { data?: Record<string, { totalCount?: unknown } | null>; errors?: unknown };
	if (errors || !data) throw new Error(`Product Hunt: ${JSON.stringify(errors ?? 'missing data')}`);
	return months.map((month, i) => {
		const launched = data[`all${i}`]?.totalCount;
		const featured = data[`featured${i}`]?.totalCount;
		if (!Number.isSafeInteger(launched) || !Number.isSafeInteger(featured) || (featured as number) < 0 || (featured as number) > (launched as number)) {
			throw new Error(`Product Hunt: invalid counts for ${month}`);
		}
		return { month, launched: launched as number, featured: featured as number };
	});
}

export const fetchProductHunt = async () => {
	const token = process.env.PRODUCT_HUNT_TOKEN;
	if (!token) throw new Error('Product Hunt: set PRODUCT_HUNT_TOKEN in .env');
	const months = completeMonths();
	const rows: ProductHuntMonth[] = [];
	for (let i = 0; i < months.length; i += MONTHS_PER_QUERY) {
		const batch = months.slice(i, i + MONTHS_PER_QUERY);
		const response = await request(API, 3, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
			body: JSON.stringify({ query: queryFor(batch) }),
		});
		rows.push(...parseProductHunt(batch, await response.json()));
	}
	await mkdir('data/raw/product-hunt', { recursive: true });
	await writeFile('data/raw/product-hunt/monthly.json', `${JSON.stringify({ months: rows }, null, '\t')}\n`);
	console.log(`Product Hunt: ${rows.length} months`);
};
