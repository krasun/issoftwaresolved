import { mkdir, writeFile } from 'node:fs/promises';

const SERIES = 'PCU513210513210';

export const fetchBlsPrices = async () => {
	const year = new Date().getUTCFullYear();
	const response = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'user-agent': 'issoftwaresolved-index' },
		body: JSON.stringify({ seriesid: [SERIES], startyear: String(year - 9), endyear: String(year) }),
	});
	if (!response.ok) throw new Error(`BLS prices: HTTP ${response.status}`);
	const { status, Results } = await response.json();
	if (status !== 'REQUEST_SUCCEEDED') throw new Error(`BLS prices: ${status}`);
	const rows = Results.series[0].data
		.filter(({ period }) => /^M(0[1-9]|1[0-2])$/.test(period))
		.map(({ year: y, period, value }) => ({ month: `${y}-${period.slice(1)}`, index: Number(value) }))
		.sort((a, b) => a.month.localeCompare(b.month));
	await mkdir('data/raw/bls-prices', { recursive: true });
	await writeFile('data/raw/bls-prices/software-publishers.json', `${JSON.stringify(rows, null, '\t')}\n`);
	console.log(`BLS prices: ${rows.length} months`);
};
