import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

// The public sitemap dates each product page by its launch day. Only monthly counts are kept.
export const fetchUneed = async () => {
	const sitemap = await (await request('https://www.uneed.best/__sitemap__/tools.xml')).text();
	const months = {};
	for (const [, month] of sitemap.matchAll(/<lastmod>(\d{4}-\d{2})/g)) months[month] = (months[month] ?? 0) + 1;
	await mkdir('data/raw/uneed', { recursive: true });
	await writeFile('data/raw/uneed/monthly.json', `${JSON.stringify(months, null, '\t')}\n`);
	console.log(`Uneed: ${Object.keys(months).length} months`);
};
