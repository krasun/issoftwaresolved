import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

export const fetchHibp = async () => {
	const breaches = await (await request('https://haveibeenpwned.com/api/v3/breaches')).json();
	if (!Array.isArray(breaches)) throw new Error('Have I Been Pwned: unexpected format');
	await mkdir('data/raw/hibp', { recursive: true });
	await writeFile('data/raw/hibp/breaches.json', `${JSON.stringify(breaches, null, '\t')}\n`);
	console.log(`Have I Been Pwned: ${breaches.length} breaches`);
};
