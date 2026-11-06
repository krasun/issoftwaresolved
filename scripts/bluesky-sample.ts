import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from './sources/lib.ts';

// A sample of public posts for stance labeling. Post text only goes to a temporary file,
// and the project keeps nothing but monthly label totals, written by scripts/bluesky-totals.ts.
const PHRASES = ['replace programmers', 'replace developers', 'replace software engineers', 'vibe coding', 'junior developers'];
const PER_MONTH = Number(process.env.PER_MONTH ?? 50);
const MONTHS = process.argv.slice(2);
// Deeper pages are refused, so each phrase uses the first page, requested slowly.
const DELAY = 1500;

interface Post {
	uri: string;
	record: { text?: string; createdAt?: string };
}

// A fixed order per post, so reruns pick the same sample.
const rank = (uri: string) => {
	let hash = 0;
	for (const char of uri) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return hash;
};

const nextMonth = (month: string) => {
	const date = new Date(`${month}-01T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + 1);
	return date.toISOString().slice(0, 7);
};

const sample: { key: string; month: string; text: string }[] = [];
for (const month of MONTHS) {
	const pool = new Map<string, string>();
	for (const phrase of PHRASES) {
		const params = new URLSearchParams({ q: `"${phrase}"`, sort: 'latest', lang: 'en', limit: '100', since: `${month}-01T00:00:00Z`, until: `${nextMonth(month)}-01T00:00:00Z` });
		const { posts } = (await (await request(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params}`, 1)).json()) as { posts: Post[] };
		for (const { uri, record } of posts) {
			const text = record?.text ?? '';
			if (text.length >= 40 && text.toLowerCase().includes(phrase) && record.createdAt?.startsWith(month)) pool.set(uri, text);
		}
		await new Promise((resolve) => setTimeout(resolve, DELAY));
	}
	const picked = [...pool.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).slice(0, PER_MONTH);
	picked.forEach(([uri, text], i) => sample.push({ key: `${month}-${i}`, month, text: text.slice(0, 600) }));
	console.log(`${month}: ${pool.size} matching, ${picked.length} sampled`);
}
const path = process.env.OUT ?? join(tmpdir(), 'bluesky-stance-text.json');
await writeFile(path, `${JSON.stringify(sample, null, '\t')}\n`);
console.log(`Text for labeling: ${path}. Delete it after labeling.`);
