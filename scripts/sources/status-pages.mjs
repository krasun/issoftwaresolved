import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

const PATH = 'data/raw/status-pages/incidents.json';
const PAGES = {
	GitHub: 'https://www.githubstatus.com',
	Claude: 'https://status.claude.com',
	DigitalOcean: 'https://status.digitalocean.com',
	Render: 'https://status.render.com',
	Netlify: 'https://www.netlifystatus.com',
	'MongoDB Cloud': 'https://status.mongodb.com',
	Sentry: 'https://status.sentry.io',
	Discord: 'https://discordstatus.com',
	Dropbox: 'https://status.dropbox.com',
	Bitbucket: 'https://bitbucket.status.atlassian.com',
	Linode: 'https://status.linode.com',
	Zoom: 'https://www.zoomstatus.com',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MAX_PAGES = 80;

const fromHistory = async (base) => {
	const incidents = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const { months } = await (await request(`${base}/history.json?page=${page}`)).json();
		if (!months?.length) break;
		for (const { name, year, incidents: list } of months) {
			const month = `${year}-${String(MONTHS.indexOf(name) + 1).padStart(2, '0')}`;
			for (const { impact } of list) incidents.push({ month, impact });
		}
		// Past the first incident the pages keep returning empty months.
		if (months.every(({ incidents: list }) => list.length === 0) && page > 1) break;
	}
	return incidents;
};

// These publish only recent incidents, so they can't be compared across years.
const recentAws = async () => {
	const buffer = await (await request('https://health.aws.amazon.com/public/events')).arrayBuffer();
	const events = JSON.parse(new TextDecoder('utf-16be').decode(buffer));
	return events.map(({ startTime }) => new Date(Number(startTime)).toISOString().slice(0, 10));
};
const recentGoogleCloud = async () =>
	(await (await request('https://status.cloud.google.com/incidents.json')).json()).map(({ begin }) => begin.slice(0, 10));
const recentNorthflank = async () => {
	const feed = await (await request('https://status.northflank.com/history.rss')).text();
	return [...feed.matchAll(/<item>[\s\S]*?<pubDate>([^<]+)/g)].map(([, date]) => new Date(date).toISOString().slice(0, 10));
};

export const fetchStatusPages = async () => {
	const saved = {};
	for (const [name, base] of Object.entries(PAGES)) saved[name] = await fromHistory(base);
	await mkdir('data/raw/status-pages', { recursive: true });
	await writeFile(PATH, `${JSON.stringify(saved)}\n`);
	const recent = {
		AWS: await recentAws(),
		'Google Cloud': await recentGoogleCloud(),
		Northflank: await recentNorthflank(),
	};
	await writeFile('data/raw/status-pages/recent.json', `${JSON.stringify(recent)}\n`);
	console.log(`Status pages: ${Object.entries(saved).map(([name, list]) => `${name} ${list.length}`).join(', ')}`);
};
