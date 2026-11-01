import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { download, parseCsv, request } from './lib.mjs';

const DIR = 'data/raw/benchmarks';
// Epoch AI's own runs are CC BY 4.0, so they are kept whole.
const OWN = ['swe_bench_verified.csv', 'mirrorcode.csv'];
// Results Epoch collected from other projects keep their own terms, so only these columns are kept.
const EXTERNAL = {
	'frontierswe_external.csv': ['Model version', 'Release date', 'Score', 'Average cost (USD)'],
	'frontiercode_external.csv': ['Model version', 'Release date', 'Main score'],
	'deepswe_external.csv': ['Model version', 'Release date', 'Pass@1'],
};

// METR publishes no data license, so only these numbers are kept, not its file.
const metrNumbers = (yaml) =>
	[
		...yaml.matchAll(
			/\n {2}(\w+):\n {4}benchmark_name[\s\S]*?p50_horizon_length:\n\s+ci_high: ([\d.]+)\n\s+ci_low: ([\d.]+)\n\s+estimate: ([\d.]+)[\s\S]*?release_date: (\S+)/g,
		),
	].map(([, model, high, low, estimate, released]) => ({ model, high: Number(high), low: Number(low), estimate: Number(estimate), released }));

export const fetchBenchmarks = async () => {
	const temp = await mkdtemp(join(tmpdir(), 'epoch-'));
	try {
		const archive = join(temp, 'benchmark_data.zip');
		await download('https://epoch.ai/data/benchmark_data.zip', archive);
		await promisify(execFile)('unzip', ['-o', '-j', archive, ...OWN, ...Object.keys(EXTERNAL), '-d', temp]);
		for (const file of OWN) await writeFile(join(DIR, file), await readFile(join(temp, file)));
		for (const [file, columns] of Object.entries(EXTERNAL)) {
			const rows = parseCsv(await readFile(join(temp, file), 'utf8'));
			const lines = rows.map((row) => columns.map((column) => row[column]).join(','));
			await writeFile(join(DIR, file), `${[columns.join(','), ...lines].join('\n')}\n`);
		}
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
	const yaml = await (await request('https://metr.org/assets/benchmark_results_1_1.yaml')).text();
	await writeFile(join(DIR, 'metr.json'), `${JSON.stringify(metrNumbers(yaml), null, '\t')}\n`);
	console.log('Benchmarks: updated');
};
