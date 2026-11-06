import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';
import type { Fact, Facts } from './no-code.ts';

// A fixed group of US-listed companies that mainly sell software.
const COMPANIES = {
	Salesforce: 1108524,
	Adobe: 796343,
	ServiceNow: 1373715,
	Workday: 1327811,
	Intuit: 896878,
	Autodesk: 769397,
	Oracle: 1341439,
	HubSpot: 1404655,
	Twilio: 1447669,
	MongoDB: 1441816,
};
const TAGS = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'];
const DAY = 86_400_000;

const durationOf = ({ start, end }: Fact) => (Date.parse(end) - Date.parse(start)) / DAY;
const quarterOf = (end: string) => {
	const date = new Date(Date.parse(end) - 45 * DAY);
	return `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
};

// Filings rarely state a fourth quarter, so it comes from the annual total minus the other three.
const quarterlyRevenue = (facts: Facts) => {
	const entries = TAGS.flatMap((tag) => facts['us-gaap']?.[tag]?.units?.USD ?? []).filter(
		({ form, start }) => start && ['10-Q', '10-K'].includes(form),
	);
	const latest = (list: Fact[]) => {
		const byEnd = new Map<string, Fact>();
		for (const entry of list) {
			const saved = byEnd.get(entry.end);
			if (!saved || entry.filed > saved.filed) byEnd.set(entry.end, entry);
		}
		return [...byEnd.values()];
	};
	const years = latest(entries.filter((entry) => durationOf(entry) >= 350 && durationOf(entry) <= 380));
	// Some filings report a full year's revenue against a three-month period, so those are ignored.
	const threeMonths = latest(entries.filter((entry) => durationOf(entry) >= 80 && durationOf(entry) <= 100)).filter(
		(entry) => !years.some(({ start, end, val }) => entry.start >= start && entry.end <= end && entry.val > val * 0.5),
	);
	const quarters = Object.fromEntries(threeMonths.map(({ end, val }) => [quarterOf(end), val]));
	for (const { start, end, val } of years) {
		const inside = threeMonths.filter((entry) => entry.start >= start && entry.end <= end);
		if (inside.length === 3 && !inside.some((entry) => entry.end === end)) {
			quarters[quarterOf(end)] = val - inside.reduce((sum, entry) => sum + entry.val, 0);
		}
	}
	return quarters;
};

export const fetchSec = async () => {
	const companies: Record<string, Record<string, number>> = {};
	const quarters: Record<string, Record<string, number>> = {};
	for (const [name, cik] of Object.entries(COMPANIES)) {
		const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`;
		const { facts } = (await (await request(url)).json()) as { facts: Facts };
		const years: Record<string, { revenue: number; filed: string }> = {};
		for (const tag of TAGS) {
			for (const { start, end, val, form, filed } of facts['us-gaap']?.[tag]?.units?.USD ?? []) {
				const days = (Date.parse(end) - Date.parse(start)) / DAY;
				if (form !== '10-K' || days < 350 || days > 380) continue;
				// Credits a fiscal year to the calendar year it mostly falls in.
				const year = new Date(Date.parse(end) - 182 * DAY).getUTCFullYear();
				if (!years[year] || filed > years[year].filed) years[year] = { revenue: val, filed };
			}
		}
		companies[name] = Object.fromEntries(Object.entries(years).map(([year, { revenue }]) => [year, revenue]));
		quarters[name] = quarterlyRevenue(facts);
		// SEC's fair access limit is 10 requests a second. This stays well below it.
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	await mkdir('data/raw/sec', { recursive: true });
	await writeFile('data/raw/sec/revenue.json', `${JSON.stringify(companies, null, '\t')}\n`);
	await writeFile('data/raw/sec/quarterly.json', `${JSON.stringify(quarters, null, '\t')}\n`);
	console.log(`SEC: ${Object.keys(companies).length} companies`);
};
