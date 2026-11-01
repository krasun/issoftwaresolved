import { mkdtemp, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { parserStream } from 'stream-json';
import { pick } from 'stream-json/filters/pick.js';
import { streamArray } from 'stream-json/streamers/stream-array.js';
import { download, writeRecords } from './lib.mjs';

const FIRST_YEAR = 2002;

const compact = ({ cve }) => {
	const metrics = cve.metrics ?? {};
	const cvss = (metrics.cvssMetricV40 ?? metrics.cvssMetricV31 ?? metrics.cvssMetricV30 ?? [])[0]?.cvssData;
	return {
		id: cve.id,
		published: cve.published,
		status: cve.vulnStatus,
		severity: cvss?.baseSeverity,
		score: cvss?.baseScore,
		cwes: [
			...new Set((cve.weaknesses ?? []).flatMap(({ description }) => description.map(({ value }) => value))),
		],
	};
};

async function* records(path) {
	const stream = createReadStream(path)
		.pipe(createGunzip())
		.pipe(parserStream())
		.pipe(pick.asStream({ filter: 'vulnerabilities' }))
		.pipe(streamArray.asStream());
	for await (const { value } of stream) yield compact(value);
}

export const fetchNvd = async () => {
	const temp = await mkdtemp(join(tmpdir(), 'nvd-'));
	try {
		for (let year = FIRST_YEAR; year <= new Date().getUTCFullYear(); year++) {
			const path = join(temp, `${year}.json.gz`);
			await download(`https://nvd.nist.gov/feeds/json/cve/2.0/nvdcve-2.0-${year}.json.gz`, path);
			await writeRecords(`data/raw/nvd/${year}.jsonl.gz`, records(path));
		}
	} finally {
		await rm(temp, { recursive: true, force: true });
	}
	console.log('NVD: downloaded');
};
