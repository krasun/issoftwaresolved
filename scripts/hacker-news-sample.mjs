import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from './sources/lib.mjs';

// Adds full months to the sample of comments for stance labeling, for example: npm run hn:sample -- 2026-10
// Comment text belongs to its authors, so it only goes to a temporary file for labeling. The project keeps comment ids and months.
const PATH = 'data/raw/hacker-news/stance-sample.json';
const PHRASES = ['replace programmers', 'replace developers', 'replace software engineers', 'vibe coding', 'junior developers'];
const PER_MONTH = 50;
const months = process.argv.slice(2);
const MAX_TEXT = 600;

const clean = (html) =>
	html
		.replace(/<[^>]+>/g, ' ')
		.replace(/&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&#x2F;/g, '/')
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

// A fixed order per comment, so reruns pick the same sample.
const rank = (id) => (Number(id) * 2654435761) % 4294967296;

const sample = [];
for (const month of months) {
	const start = new Date(`${month}-01T00:00:00Z`);
	const end = new Date(start);
	end.setUTCMonth(end.getUTCMonth() + 1);
	const pool = new Map();
	for (const phrase of PHRASES) {
		const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(`"${phrase}"`)}&tags=comment&hitsPerPage=200&numericFilters=created_at_i>=${start / 1000},created_at_i<${end / 1000}`;
		const { hits } = await (await request(url)).json();
		for (const { objectID, comment_text } of hits) {
			const text = clean(comment_text ?? '');
			if (text.length >= 40 && text.toLowerCase().includes(phrase)) pool.set(objectID, text);
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	const picked = [...pool.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).slice(0, PER_MONTH);
	for (const [id, text] of picked) sample.push({ id, month, text: text.slice(0, MAX_TEXT) });
}

const kept = JSON.parse(await readFile(PATH, 'utf8')).filter(({ month }) => !months.includes(month));
const all = [...kept, ...sample.map(({ id, month }) => ({ id, month }))].sort((a, b) => a.month.localeCompare(b.month));
await writeFile(PATH, `${JSON.stringify(all, null, '\t')}\n`);
const textPath = join(tmpdir(), 'hacker-news-stance-text.json');
await writeFile(textPath, `${JSON.stringify(sample, null, '\t')}\n`);
console.log(`Comment text for labeling: ${textPath}. Delete it after labeling.`);
console.log(`Stance sample: added ${sample.length} comments, ${all.length} in total`);
