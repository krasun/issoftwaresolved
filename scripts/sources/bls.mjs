import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

const PATH = 'data/raw/bls/software-developers.json';
const SERIES = 'OEUN000000000000015125201';

export const fetchBls = async () => {
	const year = new Date().getUTCFullYear();
	const response = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'user-agent': 'issoftwaresolved-index' },
		body: JSON.stringify({ seriesid: [SERIES], startyear: String(year - 3), endyear: String(year) }),
	});
	if (!response.ok) throw new Error(`BLS: HTTP ${response.status}`);
	const { status, Results } = await response.json();
	if (status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS: ${status}`);

	// The API only serves the latest year, so each run keeps the years already saved.
	let saved = {};
	try {
		saved = JSON.parse(await readFile(PATH, 'utf8'));
	} catch {}
	for (const { year: y, value } of Results.series[0].data) saved[y] = Number(value);
	await mkdir('data/raw/bls', { recursive: true });
	await writeFile(PATH, `${JSON.stringify(saved, null, '\t')}\n`);
	console.log(`BLS: ${Object.keys(saved).length} year(s)`);
};
