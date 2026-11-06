import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

const BASE = 'https://raw.githubusercontent.com/hiring-lab/job_postings_tracker/master';
const COUNTRIES = ['US', 'GB', 'CA', 'AU', 'FR', 'DE'];

export const fetchIndeed = async () => {
	await mkdir('data/raw/indeed', { recursive: true });
	for (const country of COUNTRIES) {
		for (const file of [`job_postings_by_sector_${country}.csv`, `aggregate_job_postings_${country}.csv`]) {
			const text = await (await request(`${BASE}/${country}/${file}`)).text();
			await writeFile(`data/raw/indeed/${file}`, text);
		}
	}
	console.log(`Indeed: ${COUNTRIES.length} countries`);
};
