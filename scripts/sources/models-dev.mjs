import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { download } from './lib.mjs';

const DIR = 'data/raw/models-dev';
const REPO = 'https://github.com/anomalyco/models.dev.git';
// Subscriptions sold for coding tools, rather than prices per token.
const PLAN = /(coding|token|code|step)-plan|^(opencode-go|cline-pass|kimi-for-coding|firepass)$/;
const TOP_MODELS = 20;

// Dated releases and vendor folders differ between providers, so a model is matched by its file name alone.
const modelKey = (path) => path.split('/').at(-1).replace(/\.toml$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const monthAfter = (month) => {
	const date = new Date(`${month}-01T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + 1);
	return date.toISOString().slice(0, 7);
};

// The catalogue as it is today, MIT License, and what it listed at the start of each month, from its git history.
export const fetchModelsDev = async () => {
	await mkdir(DIR, { recursive: true });
	await download('https://models.dev/api.json', join(DIR, 'api.json'));
	const temp = await mkdtemp(join(tmpdir(), 'models-dev-'));
	try {
		const run = (...args) => promisify(execFile)('git', args, { maxBuffer: 2 ** 30 });
		await run('clone', '--quiet', '--bare', '--filter=blob:none', REPO, temp);
		const { stdout } = await run('-C', temp, 'log', '--no-renames', '--diff-filter=AD', '--format=@%cs', '--name-status', 'HEAD', '--', 'providers/');
		const changes = [];
		let date;
		for (const line of stdout.split('\n')) {
			if (line.startsWith('@')) date = line.slice(1);
			else if (line) changes.push({ date, added: line[0] === 'A', path: line.split('\t').at(-1) });
		}
		// Branches can be merged after later commits, so changes are applied in date order.
		// The current month counts from its first day, like the other monthly sources.
		const start = `${new Date().toISOString().slice(0, 7)}-01`;
		changes.sort((a, b) => a.date.localeCompare(b.date));
		changes.splice(changes.findIndex(({ date }) => date >= start) >>> 0);
		const providers = new Set();
		const models = new Map();
		const months = {};
		for (const [i, { date, added, path }] of changes.entries()) {
			const [, provider, file, ...rest] = path.split('/');
			if (file === 'provider.toml') (added ? providers.add(provider) : providers.delete(provider));
			else if (file === 'models' && rest.length > 0) {
				const key = `${provider}\t${modelKey(path)}`;
				models.set(key, (models.get(key) ?? 0) + (added ? 1 : -1));
				if (models.get(key) <= 0) models.delete(key);
			}
			// Each month is labelled by the start of the next one.
			if (changes[i + 1]?.date.slice(0, 7) === date.slice(0, 7)) continue;
			const hosts = {};
			for (const key of models.keys()) {
				const [owner, model] = key.split('\t');
				if (providers.has(owner)) hosts[model] = (hosts[model] ?? 0) + 1;
			}
			months[monthAfter(date.slice(0, 7))] = {
				providers: providers.size,
				plans: [...providers].filter((id) => PLAN.test(id)).sort(),
				hosts: Object.fromEntries(Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, TOP_MODELS)),
			};
		}
		await writeFile(join(DIR, 'history.json'), `${JSON.stringify(months, null, '\t')}\n`);
		console.log(`models.dev: ${Object.keys(months).length} months`);
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
};
