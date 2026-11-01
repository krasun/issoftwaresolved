import { mkdir, writeFile } from 'node:fs/promises';
import { parseCsv, request } from './lib.mjs';

const series = async (id) => {
	const rows = parseCsv(await (await request(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)).text());
	return Object.fromEntries(rows.filter((row) => row[id] && row[id] !== '.').map((row) => [row.observation_date.slice(0, 7), Number(row[id])]));
};

// US information sector: real value added from BEA and employment from BLS, both through FRED.
export const fetchTechOutput = async () => {
	const output = await series('RVAI');
	const employment = await series('USINFO');
	await mkdir('data/raw/tech-output', { recursive: true });
	await writeFile('data/raw/tech-output/series.json', `${JSON.stringify({ output, employment })}\n`);
	console.log(`Tech output: ${Object.keys(output).length} quarters`);
};
