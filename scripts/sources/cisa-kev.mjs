import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const DIR = 'data/raw/cisa-kev';

export const fetchCisaKev = async () => {
	const response = await fetch(URL, { headers: { 'user-agent': 'issoftwaresolved-index' } });
	if (!response.ok) throw new Error(`CISA KEV: HTTP ${response.status}`);
	const catalog = await response.json();
	if (!Array.isArray(catalog.vulnerabilities)) throw new Error('CISA KEV: unexpected format');
	await mkdir(DIR, { recursive: true });
	await writeFile(join(DIR, 'catalog.json'), `${JSON.stringify(catalog, null, '\t')}\n`);
	console.log(`CISA KEV: ${catalog.vulnerabilities.length} vulnerabilities`);
};
