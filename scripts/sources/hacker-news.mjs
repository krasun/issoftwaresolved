import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

const SEARCH =
	'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=%22who%20is%20hiring%22&hitsPerPage=1000';
const MONTHLY = /who is hiring\?? \(([a-z]+ \d{4})\)/i;
const CONCURRENCY = 4;
const TOPICS_PATH = 'data/raw/hacker-news/topics.json';
const TOPICS = ['vibe coding', 'software is solved', 'replace programmers', 'junior developers', 'layoffs', 'ai slop'];
const FIRST_MONTH = '2015-01';
// Recent months keep gaining comments, so they are counted again on every run.
const REFRESH_MONTHS = 3;

const nextMonth = (month) => {
	const date = new Date(`${month}-01T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + 1);
	return date.toISOString().slice(0, 7);
};

// Search totals for an empty query are unreliable, so forum size comes from item IDs,
// which rise by one for every story or comment.
const lastItemBefore = async (month) => {
	const before = Date.parse(`${month}-01T00:00:00Z`) / 1000;
	const url = `https://hn.algolia.com/api/v1/search_by_date?tags=comment&hitsPerPage=1&numericFilters=created_at_i<${before}`;
	return Number((await (await request(url)).json()).hits[0].objectID);
};

const countComments = async (query, month) => {
	const from = Date.parse(`${month}-01T00:00:00Z`) / 1000;
	const to = Date.parse(`${nextMonth(month)}-01T00:00:00Z`) / 1000;
	const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=comment&hitsPerPage=0&numericFilters=created_at_i>=${from},created_at_i<${to}`;
	return (await (await request(url)).json()).nbHits;
};

// Monthly counts only. Comment text and usernames are never downloaded into storage.
const fetchTopics = async () => {
	await mkdir('data/raw/hacker-news', { recursive: true });
	let saved = {};
	try {
		saved = JSON.parse(await readFile(TOPICS_PATH, 'utf8'));
	} catch {}
	const months = [];
	const current = new Date().toISOString().slice(0, 7);
	for (let month = FIRST_MONTH; month <= current; month = nextMonth(month)) months.push(month);
	const refresh = new Set(months.slice(-REFRESH_MONTHS));
	const queue = months.filter((month) => refresh.has(month) || !saved[month]);

	const worker = async () => {
		for (let month = queue.shift(); month; month = queue.shift()) {
			const counts = { items: (await lastItemBefore(nextMonth(month))) - (await lastItemBefore(month)) };
			for (const topic of TOPICS) counts[topic] = await countComments(`"${topic}"`, month);
			saved[month] = counts;
			// Saved as it goes, so a rate limit only costs the months still missing.
			await writeFile(TOPICS_PATH, `${JSON.stringify(saved, null, '\t')}\n`);
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	};
	await worker();
};

export const fetchHackerNews = async () => {
	const { hits } = await (await request(SEARCH)).json();
	const queue = hits.filter(({ title }) => MONTHLY.test(title));
	const threads = [];

	const worker = async () => {
		for (let hit = queue.shift(); hit; hit = queue.shift()) {
			const item = await (
				await request(`https://hacker-news.firebaseio.com/v0/item/${hit.objectID}.json`)
			).json();
			// Top-level comments are the job posts. Comment text is not stored.
			threads.push({
				id: Number(hit.objectID),
				month: new Date(`1 ${MONTHLY.exec(hit.title)[1]} UTC`).toISOString().slice(0, 7),
				posts: item.kids?.length ?? 0,
				comments: item.descendants ?? hit.num_comments,
			});
		}
	};
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));

	threads.sort((a, b) => a.month.localeCompare(b.month));
	await mkdir('data/raw/hacker-news', { recursive: true });
	await writeFile('data/raw/hacker-news/threads.json', `${JSON.stringify(threads, null, '\t')}\n`);
	await fetchTopics();
	console.log(`Hacker News: ${threads.length} monthly threads and topic counts`);
};
