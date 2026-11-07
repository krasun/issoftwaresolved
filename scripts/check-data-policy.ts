import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// Local folders that hold sources without a clear license. These may only contain numbers and short labels.
const NUMBERS_ONLY = ['agent-prs', 'bluesky', 'ai-company-jobs', 'github-mcp', 'hacker-news', 'http-archive', 'layoffs', 'npm', 'product-hunt', 'pwn-watch', 'stack-overflow', 'status-pages', 'uneed'];
const BENCHMARK_FILES = ['frontierswe_external.csv', 'frontiercode_external.csv', 'deepswe_external.csv', 'metr.json'];
const TEXT_KEYS = /^(text|title|summary|description|comment|body|content|url|slug|sources?)$/i;
const MAX_STRING = 80;
const problems: string[] = [];

const scan = (value: unknown, file: string, key = ''): void => {
	if (typeof value === 'string') {
		if (TEXT_KEYS.test(key)) problems.push(`${file}: stores "${key}"`);
		else if (value.length > MAX_STRING) problems.push(`${file}: stores long text in "${key}"`);
	} else if (Array.isArray(value)) value.forEach((item) => scan(item, file, key));
	else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) scan(item, file, name);
};

for (const dir of NUMBERS_ONLY) {
	const path = join('data/raw', dir);
	for (const file of await readdir(path).catch(() => [])) {
		const full = join(path, file);
		if ((await stat(full)).isDirectory()) problems.push(`${full}: unexpected folder`);
		else if (!file.endsWith('.json')) problems.push(`${full}: unexpected file`);
		else scan(JSON.parse(await readFile(full, 'utf8')), full);
	}
}
for (const file of await readdir('data/raw/benchmarks').catch(() => [])) {
	if (!file.endsWith('.csv') && !BENCHMARK_FILES.includes(file)) problems.push(`data/raw/benchmarks/${file}: unexpected file`);
}
for (const file of BENCHMARK_FILES.filter((name) => name.endsWith('.csv'))) {
	const header = (await readFile(join('data/raw/benchmarks', file), 'utf8').catch(() => '')).split('\n')[0];
	if (/notes|source/i.test(header)) problems.push(`data/raw/benchmarks/${file}: stores more than scores`);
}
for (const file of await readdir('src/content/sources')) {
	const { dataPolicy, license } = JSON.parse(await readFile(join('src/content/sources', file), 'utf8')) as { dataPolicy?: string; license?: string };
	if (!dataPolicy) problems.push(`${file}: no dataPolicy`);
	if (dataPolicy === 'full-copy' && /^No /.test(license ?? '')) problems.push(`${file}: full copy without a license`);
	if (dataPolicy === 'quote-only' && (await readdir(join('data/raw', file.replace('.json', ''))).catch(() => null))) problems.push(`${file}: quote-only source has downloaded data`);
}

if (problems.length > 0) {
	console.error(problems.join('\n'));
	process.exit(1);
}
console.log('Data policy: OK');
