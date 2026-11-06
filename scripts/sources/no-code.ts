import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

const COMPANIES = { Wix: 1576789, Shopify: 1594805 };
const TAGS = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'Revenue', 'RevenueFromContractsWithCustomers'];
const ANNUAL_FORMS = new Set(['10-K', '20-F', '40-F']);
const DAY = 86_400_000;

export interface Fact {
	start: string;
	end: string;
	val: number;
	form: string;
	filed: string;
}
export type Facts = Record<string, Record<string, { units?: { USD?: Fact[] } }>>;

// Annual revenue from filings. These companies report under different annual forms.
export const companyRevenue = async (list: Record<string, number>) => {
	const companies: Record<string, Record<string, number>> = {};
	for (const [name, cik] of Object.entries(list)) {
		const { facts } = (await (await request(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`)).json()) as { facts: Facts };
		const years: Record<string, { revenue: number; filed: string }> = {};
		for (const tag of TAGS) {
			// Companies outside the US often report under international accounting tags.
			for (const { start, end, val, form, filed } of [...(facts['us-gaap']?.[tag]?.units?.USD ?? []), ...(facts['ifrs-full']?.[tag]?.units?.USD ?? [])]) {
				const days = (Date.parse(end) - Date.parse(start)) / DAY;
				if (!ANNUAL_FORMS.has(form) || days < 350 || days > 380) continue;
				const year = end.slice(0, 4);
				if (!years[year] || filed > years[year].filed) years[year] = { revenue: val, filed };
			}
		}
		companies[name] = Object.fromEntries(Object.entries(years).map(([year, { revenue }]) => [year, revenue]));
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	return companies;
};

export const fetchNoCode = async () => {
	const companies = await companyRevenue(COMPANIES);
	await mkdir('data/raw/no-code', { recursive: true });
	await writeFile('data/raw/no-code/revenue.json', `${JSON.stringify(companies, null, '\t')}\n`);
	console.log(`No-code: ${Object.keys(companies).length} companies`);
};
