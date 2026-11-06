import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

// `ALL` is every site crawled, which gives each share its denominator. Replit and Base44 are left out because their detection stops working.
const TECHNOLOGIES = ['ALL', 'WordPress', 'Wix', 'Squarespace', 'Webflow', 'Shopify', 'Framer Sites', 'Lovable', 'Emergent'];
const RANKS = ['ALL', 'Top 1M'];

export const fetchHttpArchive = async () => {
	const adoption: Record<string, Record<string, Record<string, number>>> = {};
	for (const rank of RANKS) {
		adoption[rank] = {};
		for (const technology of TECHNOLOGIES) {
			const url = `https://cdn.httparchive.org/v1/adoption?technology=${encodeURIComponent(technology)}&geo=ALL&rank=${encodeURIComponent(rank)}&start=2020-01-01`;
			const rows = (await (await request(url)).json()) as { date: string; adoption: { mobile: number } }[];
			// Mobile is the larger crawl, and one crawl keeps every share comparable.
			adoption[rank][technology] = Object.fromEntries(rows.filter(({ adoption: { mobile } }) => mobile).map(({ date, adoption: { mobile } }) => [date.slice(0, 7), mobile]));
			await new Promise((resolve) => setTimeout(resolve, 200));
		}
	}
	await mkdir('data/raw/http-archive', { recursive: true });
	await writeFile('data/raw/http-archive/adoption.json', `${JSON.stringify(adoption, null, '\t')}\n`);
	console.log(`HTTP Archive: ${Object.keys(adoption.ALL.ALL).length} months`);
};
