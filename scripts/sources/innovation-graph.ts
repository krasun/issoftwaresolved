import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

const BASE = 'https://raw.githubusercontent.com/github/innovationgraph/main/data';

export const fetchInnovationGraph = async () => {
	await mkdir('data/raw/innovation-graph', { recursive: true });
	for (const file of ['git_pushes', 'developers', 'repositories']) {
		await writeFile(`data/raw/innovation-graph/${file}.csv`, await (await request(`${BASE}/${file}.csv`)).text());
	}
	console.log('GitHub Innovation Graph: downloaded');
};
