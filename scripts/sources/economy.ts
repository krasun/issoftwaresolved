import { mkdir, writeFile } from 'node:fs/promises';
import { parseCsv, request } from './lib.ts';

const FRED = {
	softwareInvestment: 'B985RX1Q020SBEA',
	consumerPrices: 'CPIAUCSL',
	gdp: 'GDP',
	realGdp: 'GDPC1',
	openings: 'JTU5100JOL',
	hires: 'JTU5100HIL',
	layoffs: 'JTU5100LDL',
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const series = async (id: string) => {
	const rows = parseCsv(await (await request(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text());
	return Object.fromEntries(rows.filter((row) => row[id] && row[id] !== '.').map((row) => [row.observation_date.slice(0, 7), Number(row[id])]));
};

// US government data: BEA software investment and BLS job openings through FRED, Census business applications.
export const fetchEconomy = async () => {
	const saved: Record<string, Record<string, number>> = {};
	for (const [name, id] of Object.entries(FRED)) saved[name] = await series(id);
	const rows = parseCsv(await (await request('https://www.census.gov/econ/bfs/csv/bfs_monthly.csv')).text());
	saved.businessApplications = {};
	for (const row of rows.filter((item) => item.geo === 'US' && item.naics_sector === 'NAICS51' && item.series === 'BA_BA' && item.sa === 'A')) {
		MONTHS.forEach((name, i) => {
			if (row[name]) saved.businessApplications[`${row.year}-${String(i + 1).padStart(2, '0')}`] = Number(row[name]);
		});
	}
	// New York Fed: unemployment among recent graduates, by major.
	const majors = parseCsv(await (await request('https://www.newyorkfed.org/medialibrary/research/interactives/data/college-labor-market/college-labor-outcomes-by-major-data.csv')).text());
	saved.graduates = Object.fromEntries(
		majors
			.filter(({ Major }) => ['Computer Science', 'Computer Engineering', 'Overall'].includes(Major))
			.map(({ Major, 'Unemployment Rate': rate }) => [Major, Number(rate)]),
	);
	await mkdir('data/raw/economy', { recursive: true });
	await writeFile('data/raw/economy/series.json', `${JSON.stringify(saved)}\n`);
	console.log(`Economy: ${Object.keys(saved).length} series`);
};
