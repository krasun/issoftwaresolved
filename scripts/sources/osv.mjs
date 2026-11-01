import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { download, writeRecords } from './lib.mjs';

const run = promisify(execFile);
const ECOSYSTEMS = ['npm', 'PyPI'];

async function* records(dir, ecosystem) {
	for (const file of await readdir(dir)) {
		const { id, published, withdrawn } = JSON.parse(await readFile(join(dir, file), 'utf8'));
		yield { id, published, withdrawn, ecosystem, malicious: id.startsWith('MAL-') };
	}
}

export const fetchOsv = async () => {
	const temp = await mkdtemp(join(tmpdir(), 'osv-'));
	try {
		for (const ecosystem of ECOSYSTEMS) {
			const zip = join(temp, `${ecosystem}.zip`);
			const dir = join(temp, ecosystem);
			await download(`https://osv-vulnerabilities.storage.googleapis.com/${ecosystem}/all.zip`, zip);
			await run('unzip', ['-q', '-o', zip, '-d', dir], { maxBuffer: 1 << 24 });
			await writeRecords(`data/raw/osv/${ecosystem}.jsonl.gz`, records(dir, ecosystem));
			await rm(dir, { recursive: true, force: true });
			await rm(zip);
		}
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
	console.log('OSV: downloaded');
};
