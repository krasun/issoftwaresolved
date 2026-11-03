import { createReadStream } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { parseCsv } from './sources/lib.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = (path, data) => writeFile(path, `${JSON.stringify(data, null, '\t')}\n`);

// Pairs each value with its label, so a chart can't have a value without one.
const series = (labels, values) => {
	if (labels.length !== values.length) throw new Error(`${labels.length} labels for ${values.length} values`);
	return labels.map((label, i) => ({ label: String(label), value: values[i] }));
};
// Merges fields into a signal's file.
const updateSignal = async (id, fields) => {
	const path = `src/content/signals/${id}.json`;
	const signal = { ...(await readJson(path)), ...fields };
	await writeJson(path, signal);
	return signal;
};

const DAY = 86_400_000;
const CHATGPT_LAUNCH = [{ month: '2022-11', label: 'ChatGPT launched' }];
// These charts show raw counts, but their scores are adjusted for git pushes.
const PER_PUSH_NOTE = 'The solid line is the count. The dashed line is what the score uses: the same count divided by git pushes, with the starting month of the score set to 100. Pushes have grown faster than failures, so the dashed line can fall while the count rises.';
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const today = isoDay(Date.now());
// Quoted by hand, because OpenCode's terms restrict automated collection.
const graduateRates = (await readJson('data/raw/economy/series.json')).graduates;
const NY_FED_NOTE = `Recent graduates feel it more. Unemployment is ${graduateRates['Computer Science'].toFixed(1)}% for computer science and ${graduateRates['Computer Engineering'].toFixed(1)}% for computer engineering, against ${graduateRates.Overall.toFixed(1)}% for all majors, per the Federal Reserve Bank of New York. That is one year of data, so it does not show a trend and does not affect the score.`;
const OPENCODE_NOTE = 'Everyday use can cost far less. OpenCode reports an average of about 5 cents per session on DeepSeek V4.1 Flash, the most used model on its platform (OpenCode Data, opencode.ai/data, updated Nov 1, 2026, 10:18 AM UTC).';
const dayOf = (date) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
const percent = (part, whole) => Math.round((part / whole) * 100);
const countBy = (items, key) => {
	const counts = {};
	for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
	return counts;
};
const formatDate = (date) =>
	new Date(date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	});

const readRecords = async (dir) => {
	const records = [];
	for (const file of await readdir(dir)) {
		const lines = createInterface({ input: createReadStream(`${dir}/${file}`).pipe(createGunzip()) });
		for await (const line of lines) records.push(JSON.parse(line));
	}
	return records;
};

const number = (value) => value.toLocaleString('en-US');
const yearRows = (counts, asOf, from = '2019') =>
	Object.keys(counts)
		.filter((year) => year >= from)
		.sort()
		.map((year) => [year === asOf.slice(0, 4) ? `${year} (to ${formatDate(asOf)})` : year, counts[year]]);
const inWindow = (dates, asOf) => {
	const end = dayOf(asOf);
	const within = (from, to) => dates.filter((date) => dayOf(date) > from && dayOf(date) <= to).length;
	return { last: within(end - 365 * DAY, end), previous: within(end - 730 * DAY, end - 365 * DAY) };
};
const direction = ({ last, previous }) => {
	const delta = Math.round(((last - previous) / previous) * 100);
	return `${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)}%`;
};

const catalog = await readJson('data/raw/cisa-kev/catalog.json');
const pwn = await readJson('data/raw/pwn-watch/incidents.json');
const kev = catalog.vulnerabilities;
const incidents = pwn.incidents;
const YEARS = ['2023', '2024', '2025', '2026'];

// CISA KEV: the comparable long-term series.
const kevAsOf = dayOf(catalog.dateReleased);
const addedIn = (from, to) =>
	kev.filter(({ dateAdded }) => dayOf(dateAdded) > from && dayOf(dateAdded) <= to).length;
const last12 = addedIn(kevAsOf - 365 * DAY, kevAsOf);
const previous12 = addedIn(kevAsOf - 730 * DAY, kevAsOf - 365 * DAY);
const change = Math.round(((last12 - previous12) / previous12) * 100);

// Rolling 12-month totals, one per month. 2023 is the first year after the catalog's initial load.
const trend = [];
const securityDates = [];
for (let end = kevAsOf; end - 365 * DAY >= dayOf('2023-01-01'); end -= 30 * DAY) {
	trend.unshift(addedIn(end - 365 * DAY, end));
	securityDates.unshift(isoDay(end));
}

const kevByYear = countBy(kev, ({ dateAdded }) => dateAdded.slice(0, 4));
const kevVendors = Object.entries(countBy(kev, ({ vendorProject }) => vendorProject))
	.sort((a, b) => b[1] - a[1])
	.slice(0, 10);
const ransomware = kev.filter(({ knownRansomwareCampaignUse }) => knownRansomwareCampaignUse === 'Known');

await writeJson('data/index/cisa-kev.json', {
	asOf: formatDate(kevAsOf),
	stats: [
		{ label: 'Vulnerabilities', value: kev.length },
		{ label: 'Last 12 months', value: last12 },
		{ label: 'Previous 12 months', value: previous12 },
		{ label: 'Linked to ransomware', value: ransomware.length },
	],
	findings: [
		`${last12} vulnerabilities were added in the last 12 months, against ${previous12} in the 12 months before: ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}%.`,
		`${kevByYear['2026']} were added in 2026 by ${formatDate(kevAsOf)}, already more than the ${kevByYear['2025']} added in all of 2025.`,
		`${kevVendors[0][0]} is the most listed vendor, with ${kevVendors[0][1]} entries (${percent(kevVendors[0][1], kev.length)}% of the catalog).`,
		`${percent(ransomware.length, kev.length)}% of listed vulnerabilities are known to have been used in ransomware campaigns.`,
	],
	tables: [
		{
			title: 'Added per year',
			columns: ['Year', 'Added'],
			rows: Object.keys(kevByYear)
				.sort()
				.map((year) => [year === '2026' ? `2026 (to ${formatDate(kevAsOf)})` : year, kevByYear[year]]),
		},
		{
			title: 'Most listed vendors',
			columns: ['Vendor', 'Vulnerabilities'],
			rows: kevVendors,
		},
	],
});

// pwn.watch: richer records, but its coverage changes over time.
const onKev = incidents.filter(({ tags }) => tags.includes('cisa-kev'));
const kevCves = new Map(kev.map(({ cveID, dateAdded }) => [cveID, dateAdded.slice(0, 4)]));
const coveredCves = new Set(onKev.flatMap(({ cveIds }) => cveIds).filter((cve) => kevCves.has(cve)));
const coveredByYear = countBy([...coveredCves], (cve) => kevCves.get(cve));
const recent = incidents.filter(({ startedAt }) => startedAt >= '2026-10-01');
const recentOther = recent.filter(({ tags }) => !tags.includes('cisa-kev'));
const earlierOther = incidents.filter(
	({ startedAt, tags }) => startedAt < '2026-10-01' && !tags.includes('cisa-kev'),
);
const ai = incidents.filter(({ tags }) => tags.includes('ai'));
const aiRecent = ai.filter(({ startedAt }) => startedAt >= '2026-10-01');
const categories = countBy(incidents, ({ category }) => category);
const patch = countBy(incidents, ({ patchStatus }) => patchStatus);
const severityIn = (year) =>
	onKev.filter(({ startedAt }) => startedAt.startsWith(year) ).length;
const criticalShare = (year) =>
	percent(
		onKev.filter(({ startedAt, severity }) => startedAt.startsWith(year) && severity === 'critical').length,
		severityIn(year),
	);

await writeJson('data/index/pwn-watch.json', {
	asOf: formatDate(pwn.generatedAt),
	stats: [
		{ label: 'Incidents', value: incidents.length },
		{ label: 'Still live', value: incidents.filter(({ status }) => status === 'live').length },
		{ label: 'Unpatched', value: patch.unpatched ?? 0 },
		{ label: 'AI tooling', value: ai.length },
	],
	findings: [
		`The archive is two datasets in one. Before October 2026, ${percent(incidents.length - recent.length - earlierOther.length, incidents.length - recent.length)}% of incidents come from the CISA list. In October 2026, ${recentOther.length} of ${recent.length} do not, so that month’s spike reflects wider coverage, not a surge in attacks.`,
		`Coverage of the CISA list is complete for 2024 and 2025 but not for the other years: ${percent(coveredByYear['2023'], kevByYear['2023'])}% of 2023 and ${percent(coveredByYear['2026'], kevByYear['2026'])}% of 2026. Counting those incidents would wrongly suggest a fall in 2026.`,
		`Severity labels shifted too: ${criticalShare('2025')}% of CISA-listed incidents from 2025 are marked critical, against ${criticalShare('2026')}% from 2026.`,
		`${aiRecent.length} of the ${ai.length} incidents tagged AI started in October 2026. That is too recent, and too affected by the coverage change, to call a trend.`,
		`${percent(patch.patched, incidents.length)}% of incidents have a fix. ${patch.unpatched ?? 0} are unpatched and ${patch.partial ?? 0} are partly patched.`,
	],
	tables: [
		{
			title: 'Coverage by year',
			columns: ['Year', 'Incidents', 'On the CISA list', 'CISA vulnerabilities covered'],
			rows: YEARS.map((year) => {
				const inYear = incidents.filter(({ startedAt }) => startedAt.startsWith(year));
				return [
					year,
					inYear.length,
					inYear.filter(({ tags }) => tags.includes('cisa-kev')).length,
					`${coveredByYear[year] ?? 0} of ${kevByYear[year]} (${percent(coveredByYear[year] ?? 0, kevByYear[year])}%)`,
				];
			}),
		},
		{
			title: 'Incidents by category',
			columns: ['Category', 'Incidents'],
			rows: [
				['Patch now', categories.patch],
				['Breaches and attacks', categories.breach],
				['Supply chain', categories['supply-chain']],
			],
		},
	],
});

// NVD: every published CVE, without rejected entries.
const cves = (await readRecords('data/raw/nvd')).filter(({ status }) => status !== 'Rejected');
const nvdAsOf = cves.reduce((latest, { published }) => (published > latest ? published : latest), '');
const nvdYears = countBy(cves, ({ published }) => published.slice(0, 4));
const nvdWindow = inWindow(cves.map(({ published }) => published), nvdAsOf);
const severeIn = (year) => {
	const inYear = cves.filter(({ published }) => published.startsWith(year));
	return percent(inYear.filter(({ severity }) => severity === 'CRITICAL').length, inYear.length);
};
const weaknesses = Object.entries(
	countBy(
		cves.filter(({ published }) => published >= '2025').flatMap(({ cwes }) => cwes.map((cwe) => ({ cwe }))),
		({ cwe }) => cwe,
	),
)
	.filter(([cwe]) => cwe.startsWith('CWE-'))
	.sort((a, b) => b[1] - a[1])
	.slice(0, 5);

await writeJson('data/index/nvd.json', {
	asOf: formatDate(nvdAsOf),
	stats: [
		{ label: 'CVEs', value: cves.length },
		{ label: 'Last 12 months', value: nvdWindow.last },
		{ label: 'Previous 12 months', value: nvdWindow.previous },
		{ label: 'Critical in 2026', value: `${severeIn('2026')}%` },
	],
	findings: [
		`${number(nvdWindow.last)} CVEs were published in the last 12 months against ${number(nvdWindow.previous)} in the 12 months before: ${direction(nvdWindow)}.`,
		`${number(nvdYears['2026'])} were published in 2026 by ${formatDate(nvdAsOf)}, against ${number(nvdYears['2025'])} in all of 2025.`,
		`The share rated critical moved from ${severeIn('2024')}% in 2024 to ${severeIn('2026')}% in 2026.`,
		`${weaknesses[0][0]} is the most reported weakness since 2025, with ${number(weaknesses[0][1])} CVEs.`,
	],
	tables: [
		{ title: 'Published per year', columns: ['Year', 'CVEs'], rows: yearRows(nvdYears, nvdAsOf) },
		{ title: 'Top weaknesses since 2025', columns: ['Weakness', 'CVEs'], rows: weaknesses },
	],
});

// Have I Been Pwned: confirmed breaches, by the date they were added.
const breaches = (await readJson('data/raw/hibp/breaches.json')).filter(
	({ IsVerified, IsFabricated, IsSpamList }) => IsVerified && !IsFabricated && !IsSpamList,
);
const hibpAsOf = breaches.reduce((latest, { AddedDate }) => (AddedDate > latest ? AddedDate : latest), '');
const hibpYears = countBy(breaches, ({ AddedDate }) => AddedDate.slice(0, 4));
const hibpWindow = inWindow(breaches.map(({ AddedDate }) => AddedDate), hibpAsOf);
const accounts = {};
for (const { AddedDate, PwnCount } of breaches) {
	const year = AddedDate.slice(0, 4);
	accounts[year] = (accounts[year] ?? 0) + PwnCount;
}
const total = breaches.reduce((sum, { PwnCount }) => sum + PwnCount, 0);

await writeJson('data/index/hibp.json', {
	asOf: formatDate(hibpAsOf),
	stats: [
		{ label: 'Verified breaches', value: breaches.length },
		{ label: 'Last 12 months', value: hibpWindow.last },
		{ label: 'Previous 12 months', value: hibpWindow.previous },
		{ label: 'Billion accounts', value: (total / 1e9).toFixed(1) },
	],
	findings: [
		`${hibpWindow.last} verified breaches were added in the last 12 months against ${hibpWindow.previous} in the 12 months before: ${direction(hibpWindow)}.`,
		`Breach counts and accounts move differently: ${hibpYears['2025']} breaches with ${number(accounts['2025'])} accounts in 2025, ${hibpYears['2026']} with ${number(accounts['2026'])} so far in 2026.`,
	],
	tables: [
		{
			title: 'Added per year',
			columns: ['Year', 'Breaches', 'Accounts'],
			rows: yearRows(hibpYears, hibpAsOf).map(([label, count], i) => [
				label,
				count,
				number(accounts[Object.keys(hibpYears).filter((year) => year >= '2019').sort()[i]]),
			]),
		},
	],
});

// Exploit-DB: public exploits, by publication date.
const exploits = parseCsv(await readFile('data/raw/exploit-db/files_exploits.csv', 'utf8')).filter(
	({ date_published }) => /^\d{4}-\d{2}-\d{2}$/.test(date_published),
);
const exploitAsOf = exploits.reduce((latest, { date_published }) => (date_published > latest ? date_published : latest), '');
const exploitYears = countBy(exploits, ({ date_published }) => date_published.slice(0, 4));
const exploitWindow = inWindow(exploits.map(({ date_published }) => date_published), exploitAsOf);

await writeJson('data/index/exploit-db.json', {
	asOf: formatDate(exploitAsOf),
	stats: [
		{ label: 'Exploits', value: exploits.length },
		{ label: 'Last 12 months', value: exploitWindow.last },
		{ label: 'Previous 12 months', value: exploitWindow.previous },
		{ label: 'In 2019', value: exploitYears['2019'] },
	],
	findings: [
		`${exploitWindow.last} exploits were published in the last 12 months against ${exploitWindow.previous} in the 12 months before: ${direction(exploitWindow)}.`,
		`Yearly publications fell from ${number(exploitYears['2019'])} in 2019 to ${exploitYears['2025']} in 2025, while CVEs rose. This archive shrinking does not mean exploitation is.`,
	],
	tables: [{ title: 'Published per year', columns: ['Year', 'Exploits'], rows: yearRows(exploitYears, exploitAsOf) }],
});

// OSV: npm and PyPI advisories, split into malicious packages and ordinary vulnerabilities.
const advisories = (await readRecords('data/raw/osv')).filter(({ published, withdrawn }) => published && !withdrawn);
const osvAsOf = advisories.reduce((latest, { published }) => (published > latest ? published : latest), '');
const malicious = advisories.filter((advisory) => advisory.malicious);
const ordinary = advisories.filter((advisory) => !advisory.malicious);
const maliciousYears = countBy(malicious, ({ published }) => published.slice(0, 4));
const ordinaryYears = countBy(ordinary, ({ published }) => published.slice(0, 4));

await writeJson('data/index/osv.json', {
	asOf: formatDate(osvAsOf),
	stats: [
		{ label: 'Advisories', value: advisories.length },
		{ label: 'Malicious packages', value: malicious.length },
		{ label: 'npm malicious', value: malicious.filter(({ ecosystem }) => ecosystem === 'npm').length },
		{ label: 'PyPI malicious', value: malicious.filter(({ ecosystem }) => ecosystem === 'PyPI').length },
	],
	findings: [
		`${percent(malicious.length, advisories.length)}% of npm and PyPI advisories are malicious packages rather than bugs in real software.`,
		`${number(maliciousYears['2025'])} malicious package reports are dated 2025, against ${number(maliciousYears['2024'])} in 2024 and ${number(maliciousYears['2026'])} so far in 2026. A swing that large suggests bulk reporting, so it is not a clean trend.`,
		`Ordinary vulnerability advisories reached ${number(ordinaryYears['2026'])} in 2026, against ${number(ordinaryYears['2025'])} in 2025.`,
	],
	tables: [
		{
			title: 'Published per year',
			columns: ['Year', 'Malicious packages', 'Vulnerabilities'],
			rows: ['2022', '2023', '2024', '2025', '2026'].map((year) => [
				year === osvAsOf.slice(0, 4) ? `${year} (to ${formatDate(osvAsOf)})` : year,
				maliciousYears[year] ?? 0,
				ordinaryYears[year] ?? 0,
			]),
		},
	],
});

// Indeed: software job postings by country, February 1, 2020 = 100.
const COUNTRIES = { US: 'US', GB: 'UK', CA: 'Canada', AU: 'Australia', FR: 'France', DE: 'Germany' };
const readIndeed = async (country, file) =>
	parseCsv(await readFile(`data/raw/indeed/${file}_${country}.csv`, 'utf8'));
const lastYear = (date) => `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
const signed = (value) => `${value >= 0 ? '+' : ''}${value}%`;

const postings = {};
for (const [country, label] of Object.entries(COUNTRIES)) {
	const rows = (await readIndeed(country, 'job_postings_by_sector'))
		.filter(
			({ display_name, variable }) => display_name === 'Software Development' && variable === 'total postings',
		)
		.map(({ date, indeed_job_postings_index }) => ({ date, index: Number(indeed_job_postings_index) }));
	const latest = rows.at(-1);
	const yearAgo = rows.find(({ date }) => date === lastYear(latest.date));
	const peak = rows.reduce((best, row) => (row.index > best.index ? row : best));
	postings[country] = {
		label,
		rows,
		latest,
		peak,
		yearAgo,
		change: Math.round((latest.index / yearAgo.index - 1) * 100),
		fromPeak: Math.round((latest.index / peak.index - 1) * 100),
	};
}
const us = postings.US;
const usAll = (await readIndeed('US', 'aggregate_job_postings'))
	.filter(({ variable }) => variable === 'total postings')
	.at(-1);
const usAllIndex = Number(usAll.indeed_job_postings_index_SA ?? usAll.indeed_job_postings_index);
const falling = Object.values(postings).filter(({ change }) => change < 0);
// One point per month, ending on the latest reading so the chart matches the headline.
const monthly = [
	...us.rows
		.filter(({ date }) => date.endsWith('-01') && date.slice(0, 7) !== us.latest.date.slice(0, 7))
		.map(({ index }) => index),
	Number(us.latest.index.toFixed(1)),
];

await writeJson('data/index/indeed.json', {
	asOf: formatDate(us.latest.date),
	stats: [
		{ label: 'US index', value: us.latest.index.toFixed(1) },
		{ label: 'US year over year', value: signed(us.change) },
		{ label: 'US from peak', value: signed(us.fromPeak) },
		{ label: 'All US jobs index', value: usAllIndex.toFixed(1) },
	],
	findings: [
		`US software postings are at ${us.latest.index.toFixed(1)}, where 100 is the level of February 1, 2020. That is ${signed(us.change)} over the year, but ${Math.abs(us.fromPeak)}% below the peak of ${us.peak.index.toFixed(1)} on ${formatDate(us.peak.date)}.`,
		`All US job postings stand at ${usAllIndex.toFixed(1)} on the same scale, so software is ${us.latest.index < usAllIndex ? 'still behind' : 'ahead of'} the overall market.`,
		`${falling.length} of ${Object.keys(postings).length} countries are lower than a year ago: ${falling.map(({ label }) => label).join(', ')}.`,
	],
	tables: [
		{
			title: 'Software postings by country',
			columns: ['Country', 'Latest', 'Year ago', 'Change', 'Peak', 'From peak'],
			rows: Object.values(postings).map(({ label, latest, yearAgo, change, peak, fromPeak }) => [
				label,
				latest.index.toFixed(1),
				yearAgo.index.toFixed(1),
				signed(change),
				peak.index.toFixed(1),
				signed(fromPeak),
			]),
		},
	],
});

// BLS: people employed, once a year.
const employment = await readJson('data/raw/bls/software-developers.json');
const employmentYear = Object.keys(employment).sort().at(-1);

await writeJson('data/index/bls.json', {
	asOf: `May ${employmentYear}`,
	stats: [{ label: `US software developers, ${employmentYear}`, value: employment[employmentYear] }],
	findings: [
		`About ${number(employment[employmentYear])} people were employed as software developers in the US in May ${employmentYear}, the latest year available.`,
	],
	tables: [],
});

// Hacker News: job posts in the monthly "Who is hiring?" threads.
const threads = await readJson('data/raw/hacker-news/threads.json');
const lastThread = threads.at(-1);
const busiest = threads.reduce((best, thread) => (thread.posts > best.posts ? thread : best));
const averagePosts = (items) =>
	Math.round(items.reduce((sum, { posts }) => sum + posts, 0) / items.length);
const postsLast12 = averagePosts(threads.slice(-12));
const postsPrevious12 = averagePosts(threads.slice(-24, -12));
// Topic counts per 10,000 items, so forum growth does not inflate them.
const topicMonths = await readJson('data/raw/hacker-news/topics.json');
const topicNames = Object.keys(Object.values(topicMonths)[0]).filter((name) => name !== 'items');
const completeMonths = Object.keys(topicMonths).sort().slice(0, -1);
const topicRate = (topic, months) => {
	const mentions = months.reduce((sum, month) => sum + topicMonths[month][topic], 0);
	const comments = months.reduce((sum, month) => sum + topicMonths[month].items, 0);
	return Math.round((mentions / comments) * 100_000) / 10;
};
const topicLast = completeMonths.slice(-12);
const topicPrevious = completeMonths.slice(-24, -12);
const commentsIn = (months) => months.reduce((sum, month) => sum + topicMonths[month].items, 0);
const topicTable = topicNames.map((topic) => [
	`"${topic}"`,
	topicRate(topic, topicPrevious),
	topicRate(topic, topicLast),
	topicLast.reduce((sum, month) => sum + topicMonths[month][topic], 0),
]);
const fastestTopic = [...topicTable].sort((a, b) => b[2] - b[1] - (a[2] - a[1]))[0];
// Stance: AI labels on a sample of comments. Only these totals are published.
const stanceSample = await readJson('data/raw/hacker-news/stance-sample.json');
const stanceLabels = await readJson('data/raw/hacker-news/stance-labels.json');
const stanceMonths = [...new Set(stanceSample.map(({ month }) => month))].sort();
const stancePeriods = [
	['Previous 12 months', stanceMonths.slice(-24, -12)],
	['Last 12 months', stanceMonths.slice(-12)],
	['Both periods', stanceMonths.slice(-24)],
];
const stanceRow = ([name, months]) => {
	const labels = stanceSample.filter(({ month }) => months.includes(month)).map(({ id }) => stanceLabels[id]);
	const count = (label) => labels.filter((value) => value === label).length;
	return [name, labels.length, count('solved'), count('not_solved'), count('unclear')];
};
const stanceRows = stancePeriods.map(stanceRow);
const stanceAll = stanceRows.at(-1);
const threadYears = [...new Set(threads.map(({ month }) => month.slice(0, 4)))];

await writeJson('data/index/hacker-news.json', {
	asOf: lastThread.month,
	stats: [
		{ label: 'Monthly threads', value: threads.length },
		{ label: 'Latest month', value: lastThread.posts },
		{ label: 'Average, last 12', value: postsLast12 },
		{ label: 'Busiest month', value: busiest.posts },
	],
	findings: [
		`The latest thread (${lastThread.month}) has ${lastThread.posts} job posts. The busiest was ${busiest.month}, with ${busiest.posts}.`,
		`Threads averaged ${postsLast12} posts over the last 12 months, against ${postsPrevious12} in the 12 months before.`,
		`${fastestTopic[0]} grew the most, from ${fastestTopic[1]} to ${fastestTopic[2]} mentions per 10,000 items between the previous 12 months and the last 12.`,
		`In a sample of ${stanceAll[1]} comments mentioning programmer replacement, vibe coding or junior developers, ${stanceAll[2]} argued that software is getting solved, ${stanceAll[3]} argued that it is not, and ${stanceAll[4]} took no clear position. The sample is too small to show a trend.`,
		`Hacker News grew from ${number(commentsIn(topicPrevious))} to ${number(commentsIn(topicLast))} stories and comments between those periods.`,
	],
	tables: [
		{
			title: 'Stance in sampled comments',
			columns: ['Period', 'Comments', 'Getting solved', 'Not solved', 'Unclear'],
			rows: stanceRows,
		},
		{
			title: 'Phrases in comments, per 10,000 items',
			columns: ['Phrase', 'Previous 12 months', 'Last 12 months', 'Mentions, last 12 months'],
			rows: topicTable,
		},
		{
			title: 'Average job posts per thread',
			columns: ['Year', 'Average posts', 'Threads'],
			rows: threadYears.map((year) => {
				const inYear = threads.filter(({ month }) => month.startsWith(year));
				return [year, averagePosts(inYear), inYear.length];
			}),
		},
	],
});

// Status pages: one grouped source, counted by month.
const statusPages = await readJson('data/raw/status-pages/incidents.json');
const recentStatus = await readJson('data/raw/status-pages/recent.json');
const countable = (list) => list.filter(({ impact }) => impact !== 'none');
const nextMonth = (month, by = 1) => {
	const date = new Date(`${month}-01T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + by);
	return date.toISOString().slice(0, 7);
};
const statusAsOf = catalog.dateReleased.slice(0, 7);
const rolling = (list, end) => {
	const start = nextMonth(end, -12);
	return countable(list).filter(({ month }) => month > start && month <= end).length;
};
const STATUS_SOURCES = {
	'github-status': 'GitHub',
	'claude-status': 'Claude',
	'digitalocean-status': 'DigitalOcean',
	'render-status': 'Render',
	'netlify-status': 'Netlify',
	'mongodb-status': 'MongoDB Cloud',
	'sentry-status': 'Sentry',
	'discord-status': 'Discord',
	'dropbox-status': 'Dropbox',
	'bitbucket-status': 'Bitbucket',
	'linode-status': 'Linode',
	'zoom-status': 'Zoom',
};
const statusNames = Object.values(STATUS_SOURCES);
// All services have comparable history from 2024, once Claude has a full year behind it.
const majorRolling = (month) => statusNames.reduce((sum, name) => sum + rolling(statusPages[name], month), 0);
const majorLast = majorRolling(statusAsOf);
const majorPrevious = majorRolling(nextMonth(statusAsOf, -12));
const majorChange = Math.round((majorLast / majorPrevious - 1) * 100);
const outageTrend = [];
for (let month = '2024-12'; month <= statusAsOf; month = nextMonth(month)) outageTrend.push(majorRolling(month));
const incidentYears = ['2021', '2022', '2023', '2024', '2025', '2026'];
const inYear = (list, year) => countable(list).filter(({ month }) => month.startsWith(year)).length;

for (const [id, name] of Object.entries(STATUS_SOURCES)) {
	const list = statusPages[name];
	const last = rolling(list, statusAsOf);
	const previous = rolling(list, nextMonth(statusAsOf, -12));
	const inLastYear = countable(list).filter(({ month }) => month > nextMonth(statusAsOf, -12));
	const serious = inLastYear.filter(({ impact }) => ['major', 'critical'].includes(impact)).length;
	await writeJson(`data/index/${id}.json`, {
		asOf: statusAsOf,
		stats: [
			{ label: 'Last 12 months', value: last },
			{ label: 'Previous 12 months', value: previous },
			{ label: 'Major or critical', value: serious },
			{ label: 'All time', value: countable(list).length },
		],
		findings: [
			`${name} reported ${last} incidents in the last 12 months against ${previous} in the 12 months before: ${direction({ last, previous })}.`,
			`${serious} of the last ${last} were marked major or critical, which is ${percent(serious, last)}%.`,
			'More reported incidents can mean more failures, more products or more honest reporting. These numbers cannot separate them.',
		],
		tables: [
			{
				title: 'Incidents per year',
				columns: ['Year', 'Incidents'],
				rows: incidentYears.map((year) => [year, inYear(list, year)]),
			},
		],
	});
}

// SEC: combined revenue, only for years every company reported.
const companies = await readJson('data/raw/sec/revenue.json');
const companyList = Object.values(companies);
const revenueYears = Object.keys(companyList[0])
	.filter((year) => companyList.every((revenue) => revenue[year]))
	.sort();
const billions = (value) => Math.round(value / 1e9);
const revenueTotals = revenueYears.map((year) => companyList.reduce((sum, revenue) => sum + revenue[year], 0));
const latestRevenue = revenueTotals.at(-1);
const revenueChange = Math.round((latestRevenue / revenueTotals.at(-2) - 1) * 100);
const fastest = Object.entries(companies)
	.map(([name, revenue]) => [name, Math.round((revenue[revenueYears.at(-1)] / revenue[revenueYears.at(-2)] - 1) * 100)])
	.sort((a, b) => b[1] - a[1]);

await writeJson('data/index/sec.json', {
	asOf: revenueYears.at(-1),
	stats: [
		{ label: `Combined revenue, ${revenueYears.at(-1)}`, value: `$${billions(latestRevenue)}B` },
		{ label: 'Year over year', value: signed(revenueChange) },
		{ label: 'Companies', value: companyList.length },
		{ label: 'Years compared', value: revenueYears.length },
	],
	findings: [
		`These ${companyList.length} companies earned $${billions(latestRevenue)}B in ${revenueYears.at(-1)}, ${signed(revenueChange)} on the year before.`,
		`${fastest.filter(([, change]) => change < 0).length} of ${companyList.length} shrank. ${fastest[0][0]} grew fastest at ${signed(fastest[0][1])}, and ${fastest.at(-1)[0]} grew slowest at ${signed(fastest.at(-1)[1])}.`,
	],
	tables: [
		{
			title: 'Combined revenue per year',
			columns: ['Year', 'Revenue'],
			rows: revenueYears.slice(-8).map((year) => [year, `$${billions(revenueTotals[revenueYears.indexOf(year)])}B`]),
		},
		{
			title: `Growth by company, ${revenueYears.at(-1)}`,
			columns: ['Company', 'Change'],
			rows: fastest.map(([name, change]) => [name, signed(change)]),
		},
	],
});

// BLS: producer prices for software publishers.
const priceRows = await readJson('data/raw/bls-prices/software-publishers.json');
const latestPrice = priceRows.at(-1);
const priceYearAgo = priceRows.find(({ month }) => month === nextMonth(latestPrice.month, -12));
const priceChange = Math.round((latestPrice.index / priceYearAgo.index - 1) * 100);
const priceStart = priceRows[0];

await writeJson('data/index/bls-prices.json', {
	asOf: latestPrice.month,
	stats: [
		{ label: 'Latest index', value: latestPrice.index.toFixed(1) },
		{ label: 'Year over year', value: signed(priceChange) },
		{ label: `Since ${priceStart.month.slice(0, 4)}`, value: signed(Math.round((latestPrice.index / priceStart.index - 1) * 100)) },
	],
	findings: [
		`Software publisher prices are ${signed(priceChange)} on the year, and ${signed(Math.round((latestPrice.index / priceStart.index - 1) * 100))} since ${priceStart.month}.`,
	],
	tables: [],
});

// LiteLLM: listed AI model prices.
const tokenPrices = await readJson('data/raw/litellm/monthly.json');
const tokenMonths = Object.keys(tokenPrices).sort();
const dollars = (value) => `$${value < 1 ? value.toFixed(value < 0.01 ? 4 : 2) : value.toFixed(2)}`;

const blended = ([input, output]) => (3 * input + output) / 4;
const medianOf = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const pricedMonths = tokenMonths.filter((month) => Object.keys(tokenPrices[month].prices ?? {}).length > 0);
const tokenPriceAt = (month) => medianOf(Object.values(tokenPrices[month].prices).map(blended));
const tokenTrend = pricedMonths.map((month) => Math.round(tokenPriceAt(month) * 100) / 100);
const tokenLatest = pricedMonths.at(-1);
const tokenYearAgo = nextMonth(tokenLatest, -12);
const tokenChange = Math.round((tokenPriceAt(tokenLatest) / tokenPriceAt(tokenYearAgo) - 1) * 100);
// The same model a year apart. "Latest" names point to different models over time, so they are left out.
const pricesThen = tokenPrices[tokenYearAgo].prices;
const pricesNow = tokenPrices[tokenLatest].prices;
const sameModels = Object.keys(pricesNow).filter((name) => pricesThen[name] && !name.includes('latest'));
const moved = (name) => blended(pricesNow[name]) / blended(pricesThen[name]);
const modelsCheaper = sameModels.filter((name) => moved(name) < 0.995);
const modelsPricier = sameModels.filter((name) => moved(name) > 1.005);
const modelsUnchanged = sameModels.length - modelsCheaper.length - modelsPricier.length;

await writeJson('data/index/litellm.json', {
	asOf: tokenMonths.at(-1),
	stats: [
		{ label: 'Median per 1M tokens', value: dollars(tokenPriceAt(tokenLatest)) },
		{ label: 'Year over year', value: signed(tokenChange) },
		{ label: 'Same models, unchanged', value: `${modelsUnchanged} of ${sameModels.length}` },
		{ label: 'Models compared', value: Object.keys(pricesNow).length },
	],
	findings: [
		`The median price went from ${dollars(tokenPriceAt(tokenYearAgo))} to ${dollars(tokenPriceAt(tokenLatest))} per million tokens between ${tokenYearAgo} and ${tokenLatest}: ${signed(tokenChange)}.`,
		`Of ${sameModels.length} models listed in both months, ${modelsUnchanged} kept their price, ${modelsCheaper.length} got cheaper and ${modelsPricier.length} got more expensive.`,
	],
	tables: [
		{
			title: 'Median price over time',
			columns: ['Month', 'Per 1M tokens', 'Models'],
			rows: pricedMonths
				.filter((month) => month.endsWith('-01') || month.endsWith('-07') || month === tokenLatest)
				.map((month) => [month, dollars(tokenPriceAt(month)), Object.keys(tokenPrices[month].prices).length]),
		},
	],
});

// Uneed: products launched per month, a weak proxy for new software.
const launches = await readJson('data/raw/uneed/monthly.json');
const launchMonths = Object.keys(launches)
	.sort()
	.filter((month) => month >= '2024-02' && month < new Date().toISOString().slice(0, 7));
const launchLatest = launchMonths.at(-1);
const launchYearAgo = nextMonth(launchLatest, -12);
const launchChange = Math.round((launches[launchLatest] / launches[launchYearAgo] - 1) * 100);
const launchTrend = launchMonths.map((month) => launches[month]);

await writeJson('data/index/uneed.json', {
	asOf: launchLatest,
	stats: [
		{ label: `Launches, ${launchLatest}`, value: launches[launchLatest] },
		{ label: 'Year over year', value: signed(launchChange) },
		{ label: `Since ${launchMonths[0]}`, value: launchTrend.reduce((sum, count) => sum + count, 0) },
	],
	findings: [
		`${launches[launchLatest]} products launched in ${launchLatest}, against ${launches[launchYearAgo]} in ${launchYearAgo}: ${signed(launchChange)}.`,
		'This is one launch site, so its growth may reflect the site itself rather than more software being built.',
	],
	tables: [
		{
			title: 'Launches, latest months',
			columns: ['Month', 'Products'],
			rows: launchMonths.slice(-12).map((month) => [month, launches[month]]),
		},
	],
});

// Innovation Graph: worldwide activity by quarter.
const quarterTotals = async (file, column) => {
	const totals = {};
	for (const row of parseCsv(await readFile(`data/raw/innovation-graph/${file}.csv`, 'utf8'))) {
		// EU is an aggregate of countries already in the list.
		if (row.iso2_code === 'EU') continue;
		const quarter = `${row.year} Q${row.quarter}`;
		totals[quarter] = (totals[quarter] ?? 0) + Number(row[column]);
	}
	return totals;
};
const pushes = await quarterTotals('git_pushes', 'git_pushes');
const developers = await quarterTotals('developers', 'developers');
const quarters = Object.keys(pushes).sort();
const latestQuarter = quarters.at(-1);
const quarterYearAgo = quarters.at(-5);
const pushChange = Math.round((pushes[latestQuarter] / pushes[quarterYearAgo] - 1) * 100);
const millions = (value) => Math.round(value / 1e6);

// npm: total downloads per month, ignoring the month still in progress.
const npmMonths = await readJson('data/raw/npm/monthly.json');
const npmList = Object.keys(npmMonths).sort().slice(0, -1);
const npmLatest = npmList.at(-1);
const npmYearAgo = nextMonth(npmLatest, -12);
const npmChange = Math.round((npmMonths[npmLatest] / npmMonths[npmYearAgo] - 1) * 100);

await writeJson('data/index/innovation-graph.json', {
	asOf: latestQuarter,
	stats: [
		{ label: `Git pushes, ${latestQuarter}`, value: `${millions(pushes[latestQuarter])}M` },
		{ label: 'Year over year', value: signed(pushChange) },
		{ label: 'Developers', value: `${millions(developers[latestQuarter])}M` },
	],
	findings: [
		`Git pushes reached ${millions(pushes[latestQuarter])} million in ${latestQuarter}, against ${millions(pushes[quarterYearAgo])} million a year earlier: ${signed(pushChange)}.`,
		`The developer count moved from ${millions(developers[quarterYearAgo])} million to ${millions(developers[latestQuarter])} million, so pushes are ${pushChange > Math.round((developers[latestQuarter] / developers[quarterYearAgo] - 1) * 100) ? 'growing faster than' : 'not outpacing'} developers. Automation and AI agents could be part of that, but this data cannot show it.`,
	],
	tables: [
		{
			title: 'Latest quarters',
			columns: ['Quarter', 'Git pushes', 'Developers'],
			rows: quarters.slice(-8).map((quarter) => [quarter, `${millions(pushes[quarter])}M`, `${millions(developers[quarter] ?? 0)}M`]),
		},
	],
});

await writeJson('data/index/npm.json', {
	chart: { name: 'Monthly package downloads', trend: series(npmList, npmList.map(month => npmMonths[month])) },
	asOf: npmLatest,
	stats: [
		{ label: `Downloads, ${npmLatest}`, value: `${Math.round(npmMonths[npmLatest] / 1e9)}B` },
		{ label: 'Year over year', value: signed(npmChange) },
	],
	findings: [
		`npm served ${Math.round(npmMonths[npmLatest] / 1e9)} billion downloads in ${npmLatest}, ${signed(npmChange)} on a year earlier. CI systems and AI agents inflate this, so it shows activity rather than human demand.`,
	],
	tables: [
		{
			title: 'Downloads in January of each year',
			columns: ['Year', 'Downloads'],
			rows: npmList.filter((month) => month.endsWith('-01')).slice(-8).map((month) => [month.slice(0, 4), `${Math.round(npmMonths[month] / 1e9)}B`]),
		},
	],
});

// MCP servers: GitHub repos as the headline, the official registry as background.
const mcpRepos = await readJson('data/raw/github-mcp/monthly.json');
const mcpMonths = Object.keys(mcpRepos).sort().slice(0, -1);
const mcpLatest = mcpMonths.at(-1);
const mcpYearAgo = nextMonth(mcpLatest, -12);
const mcpChange = Math.round((mcpRepos[mcpLatest] / mcpRepos[mcpYearAgo] - 1) * 100);
const mcpTotal = mcpMonths.reduce((sum, month) => sum + mcpRepos[month], 0);
const mcpTrend = mcpMonths.map((month) => mcpRepos[month]);

await writeJson('data/index/github-mcp.json', {
	asOf: mcpLatest,
	stats: [
		{ label: `New repos, ${mcpLatest}`, value: mcpRepos[mcpLatest] },
		{ label: 'Year over year', value: signed(mcpChange) },
		{ label: `Repos created since ${mcpMonths[0]}`, value: mcpTotal },
	],
	findings: [
		`${number(mcpRepos[mcpLatest])} repos tagged mcp-server were created in ${mcpLatest}, against ${number(mcpRepos[mcpYearAgo])} in ${mcpYearAgo}: ${signed(mcpChange)}.`,
		'This shows people are still building connections for AI models. It does not show that those servers work or get used.',
	],
	tables: [
		{
			title: 'New repos, latest months',
			columns: ['Month', 'Repos'],
			rows: mcpMonths.slice(-12).map((month) => [month, mcpRepos[month]]),
		},
	],
});

const registry = await readJson('data/raw/mcp-registry/monthly.json');
const registryMonths = Object.keys(registry.months).sort().filter((month) => month < catalog.dateReleased.slice(0, 7));
const registryAllMonths = Object.values(registry.months);
const registryTotal = registryAllMonths.reduce((sum, count) => sum + count, 0);
const registryLatest = registryMonths.at(-1);

await writeJson('data/index/mcp-registry.json', {
	asOf: registryLatest,
	stats: [
		{ label: 'Servers', value: registryTotal },
		{ label: `First published, ${registryLatest}`, value: registry.months[registryLatest] },
		{ label: 'Entries, including versions', value: registry.entries },
	],
	findings: [
		`The registry lists ${number(registryTotal)} servers. ${number(registry.months[registryLatest])} were first published in ${registryLatest}.`,
		'Publishing here is optional, so growth also reflects people adopting the registry.',
	],
	tables: [
		{
			title: 'Servers by first publish month',
			columns: ['Month', 'Servers'],
			rows: registryMonths.map((month) => [month, registry.months[month]]),
		},
	],
});

// AI company jobs: job boards only show today, so each run adds to a saved history.
const aiJobs = await readJson('data/raw/ai-company-jobs/latest.json');
const AI_JOBS_HISTORY = 'data/ai-company-jobs-history.json';
const aiJobsHistory = await readFile(AI_JOBS_HISTORY, 'utf8').then(JSON.parse).catch(() => ({}));
const aiJobsTotal = (companies) => Object.values(companies).reduce((sum, { engineering }) => sum + engineering, 0);
aiJobsHistory[aiJobs.date] = aiJobs.companies;
await writeJson(AI_JOBS_HISTORY, aiJobsHistory);
const aiJobsRows = Object.entries(aiJobs.companies).sort((a, b) => b[1].engineering - a[1].engineering);
const aiJobsLatest = aiJobsTotal(aiJobs.companies);
const aiJobsHiring = aiJobsRows.filter(([, { engineering }]) => engineering > 0);
const aiJobsTrend = Object.keys(aiJobsHistory).sort().map((date) => aiJobsTotal(aiJobsHistory[date]));

await writeJson('data/index/ai-company-jobs.json', {
	asOf: formatDate(aiJobs.date),
	stats: [
		{ label: 'Engineering roles', value: aiJobsLatest },
		{ label: 'Companies hiring', value: `${aiJobsHiring.length} of ${aiJobsRows.length}` },
		{ label: 'All open roles', value: aiJobsRows.reduce((sum, [, { open }]) => sum + open, 0) },
	],
	findings: [
		`${aiJobsHiring.length} of ${aiJobsRows.length} companies list open software engineering roles, ${number(aiJobsLatest)} in total.`,
		`${aiJobsRows[0][0]} has the most, with ${aiJobsRows[0][1].engineering}.`,
	],
	tables: [
		{
			title: 'Open roles by company',
			columns: ['Company', 'Software engineering', 'All roles'],
			rows: aiJobsRows.map(([name, { engineering, open }]) => [name, engineering, open]),
		},
	],
});

// Only the numbers change here. The signal's wording is edited by hand.
await updateSignal('security', {
	value: String(last12),
	change: signed(change),
	trend: series(securityDates, trend),
	chartNote: PER_PUSH_NOTE,
});

const jobDates = [...us.rows.filter(({ date }) => date.endsWith('-01') && date.slice(0, 7) !== us.latest.date.slice(0, 7)).map(row => row.date), us.latest.date];
await updateSignal('jobs', {
	value: us.latest.index.toFixed(1),
	change: signed(us.change),
	trend: series(jobDates, monthly),
});

// Status rules are deliberately simple: under 2% either way counts as flat.
const reading = (change, { up, down }, upDirection) => {
	if (Math.abs(change) < 2) return { status: 'Flat', direction: 'flat' };
	if (change > 0) return { status: up, direction: upDirection };
	return { status: down, direction: upDirection === 'away' ? 'toward' : 'away' };
};
const fromHighOf = (values) => {
	const delta = Math.round((values.at(-1) / Math.max(...values) - 1) * 100);
	return delta === 0 ? 'At its high' : `${signed(delta)} from high`;
};
// The cards chart the last year of a signal, with its start set to 100.
const recentOf = (values, points) => {
	const recent = values.slice(-points);
	return recent.map((value) => Math.round((value / recent[0]) * 1000) / 10);
};
const [, , stanceSolved, stanceNotSolved] = stanceRows[1];
const solvedShare = percent(stanceSolved, stanceSolved + stanceNotSolved);
// Share of comments taking a side that say "solved", per month.
const stanceByMonth = stanceMonths.map((month) => {
	const labels = stanceSample.filter((comment) => comment.month === month).map(({ id }) => stanceLabels[id]);
	const solved = labels.filter((label) => label === 'solved').length;
	const notSolved = labels.filter((label) => label === 'not_solved').length;
	return { month, solved, notSolved, share: percent(solved, solved + notSolved) };
});
console.log(stanceByMonth.slice(-3).map(({ month, solved, notSolved, share }) => `${month} ${solved}/${solved + notSolved} ${share}%`).join(', '));
// Bluesky: monthly label totals from a separate sample. Sentiment averages both communities.
const blueskyStance = await readJson('data/raw/bluesky/stance.json');
const blueskyMonths = Object.keys(blueskyStance).sort();
const blueskyShare = (months) => {
	const solved = months.reduce((sum, month) => sum + blueskyStance[month].solved, 0);
	const notSolved = months.reduce((sum, month) => sum + blueskyStance[month].not_solved, 0);
	return { solved, notSolved, share: percent(solved, solved + notSolved) };
};
const blueskyLast = blueskyShare(blueskyMonths.slice(-12));
const combinedShare = Math.round((solvedShare + blueskyLast.share) / 2);
const combinedByMonth = stanceByMonth.map(({ month, share }) => Math.round((share + blueskyShare([month]).share) / 2));
await writeJson('data/index/bluesky.json', {
	asOf: blueskyMonths.at(-1),
	stats: [
		{ label: 'Say it is getting solved, last 12 months', value: `${blueskyLast.share}%` },
		{ label: 'Posts taking a side', value: blueskyLast.solved + blueskyLast.notSolved },
	],
	findings: [`In the last 12 months, ${blueskyLast.solved} sampled posts argued software is getting solved and ${blueskyLast.notSolved} argued it is not.`],
	tables: [],
});
{
	const path = 'src/content/sources/bluesky.json';
	await writeJson(path, { ...(await readJson(path)), checked: blueskyMonths.at(-1) });
}
await updateSignal('sentiment', {
	value: `${combinedShare}%`,
	metric: 'Sampled Hacker News comments and Bluesky posts taking a side that say it is getting solved, last 12 months',
	trendLabel: 'Share of sampled posts taking a side that say software is getting solved, per month, averaged across Hacker News and Bluesky. Each month rests on few posts, so expect noise.',
	trend: series(stanceMonths, combinedByMonth),
	recent: combinedByMonth.slice(-5),
	analysis: {
		title: 'Two communities',
		intro: 'Both samples are small, and most posts take no clear side, so read these as rough readings.',
		points: [
			`Hacker News: ${solvedShare}% say it is getting solved, ${stanceSolved} comments against ${stanceNotSolved}.`,
			`Bluesky: ${blueskyLast.share}% say it is getting solved, ${blueskyLast.solved} posts against ${blueskyLast.notSolved}.`,
			'In the 2025 Stack Overflow Developer Survey, 84% use or plan to use AI tools, but more developers distrust their accuracy (46%) than trust it (33%). This does not affect the score.',
		],
	},
	...(combinedShare >= 50
		? { status: 'Convinced', direction: 'toward' }
		: { status: 'Skeptical', direction: 'away' }),
	rule: 'Skeptical when under half of the sampled comments taking a side say software is getting solved.',
});
// Fed funds rate: compared with software postings and all US postings on the same dates.
const fedFunds = await readJson('data/raw/fed-funds/monthly.json');
const allUsRows = (await readIndeed('US', 'aggregate_job_postings'))
	.filter(({ variable }) => variable === 'total postings')
	.map(({ date, indeed_job_postings_index_SA: index }) => ({ date, index: Number(index) }));
const trendStart = us.rows[0].date.slice(0, 7);
const trendMonths = monthly.map((_, i) => nextMonth(trendStart, i));
const rateTrend = trendMonths.flatMap((month) => fedFunds[month] ?? []);
const rateMonths = Object.keys(fedFunds).sort().filter((month) => month >= trendStart);
const ratePeak = Math.max(...rateTrend);
const ratePeakStart = rateMonths.find((month) => fedFunds[month] === ratePeak);
const monthName = (month) =>
	new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const rateLatestMonth = rateMonths.at(-1);
const CHATGPT = '2022-11-30';
const softwareOn = (date) => us.rows.find((row) => row.date === date).index;
const allOn = (date) => allUsRows.find((row) => row.date === date).index;
const softwareLow = us.rows.reduce((low, row) => (row.index < low.index ? row : low));
const fallBeforeChatGpt = Math.round((1 - softwareOn(CHATGPT) / us.peak.index) * 100);
const gapToday = Math.round((1 - us.latest.index / allOn(us.latest.date)) * 100);
const riseFromLow = Math.round((us.latest.index / softwareLow.index - 1) * 100);
const allFromLowDate = signed(Math.round((allOn(us.latest.date) / allOn(softwareLow.date) - 1) * 100));
await updateSignal('jobs', {
	...reading(us.change, { up: 'Recovering', down: 'Falling' }, 'away'),
	comparison: { name: 'Federal funds rate (%)', trend: series(jobDates.slice(0, rateTrend.length), rateTrend) },
	events: [
		{ month: '2022-03', label: 'First rate rise' },
		{ month: '2022-11', label: 'ChatGPT' },
	],
	analysis: {
		title: 'Is it AI or interest rates?',
		intro: 'It is too early to tell. The timing leaves room for an AI turning point, but rates and the wider economy could explain the fall on their own.',
		points: [
			`Postings peaked at ${us.peak.index.toFixed(1)} on ${formatDate(us.peak.date)}, weeks before the Federal Reserve began raising rates. The rate went from ${fedFunds['2022-02']}% to ${ratePeak}% by ${monthName(ratePeakStart)}, which made it more expensive for companies to fund growth.`,
			`ChatGPT came out on ${formatDate(CHATGPT)}. By then postings were already ${fallBeforeChatGpt}% below their peak, so AI tools cannot explain that part of the fall.`,
			`On that day, software and all US postings were about level, at ${softwareOn(CHATGPT).toFixed(1)} and ${allOn(CHATGPT).toFixed(1)}. Today software is ${gapToday}% behind, at ${us.latest.index.toFixed(1)} against ${allOn(us.latest.date).toFixed(1)}. AI could be part of that gap, but so could rates hitting software harder.`,
			`Postings kept falling after rates came down, to a low of ${softwareLow.index.toFixed(1)} on ${formatDate(softwareLow.date)}. They have since risen ${riseFromLow}%, against ${allFromLowDate} for all US postings, so the link to rates is not simple.`,
			'Other causes overlap. Companies hired heavily during the pandemic, and from 2022 to 2024 a US tax rule made them spread software development costs over five years. A 2025 law restored immediate deductions for US development.',
			NY_FED_NOTE,
		],
	},
	recent: recentOf(monthly, 13),
	rule: 'Recovering when postings rise over the year. Falling postings move toward solved.',
	fromHigh: `${signed(us.fromPeak)} from high`,
});
await updateSignal('security', {
	...reading(change, { up: 'Getting worse', down: 'Improving' }, 'away'),
	recent: recentOf(trend, 13),
	rule: 'Getting worse when more exploited vulnerabilities are listed than a year before.',
	fromHigh: fromHighOf(trend),
});
await updateSignal('outages', {
	value: number(majorLast),
	change: signed(majorChange),
	trend: series(outageTrend.map((_, i) => nextMonth('2024-12', i)), outageTrend),
	chartNote: PER_PUSH_NOTE,
	recent: recentOf(outageTrend, 13),
	...reading(majorChange, { up: 'More incidents', down: 'Fewer incidents' }, 'away'),
	rule: 'More incidents when these services report more than in the previous 12 months.',
	metric: `Incidents at ${statusNames.length} software services, last 12 months`,
	trendLabel: `Rolling 12-month total of incidents at ${statusNames.length} software services, one point per month.`,
	analysis: {
		title: 'Which services are counted',
		intro: `${statusNames.join(', ')}.`,
		points: [
			...Object.entries(recentStatus).map(([name, dates]) => `${name} is not counted, because its public feed only covers recent incidents. It currently shows ${dates.length}, going back to ${formatDate(dates.reduce((oldest, date) => (date < oldest ? date : oldest)))}.`),
			'Twilio is not counted, because its roughly 3,500 yearly notices would swamp the total. Railway is not counted, because we found no machine-readable incident history.',
			'A service that reports more honestly can look worse, so this shows reported incidents, not true reliability.',
		],
	},
	fromHigh: fromHighOf(outageTrend),
});
const revenueTrend = revenueTotals.slice(-10).map(billions);
// The card chart uses quarters every company has reported, so its line has real points.
const quarterly = await readJson('data/raw/sec/quarterly.json');
const quarterList = Object.values(quarterly);
const sharedQuarters = Object.keys(quarterList[0])
	.filter((quarter) => quarterList.every((company) => company[quarter] > 0))
	.sort();
const quarterlyTotals = sharedQuarters.map((quarter) =>
	quarterList.reduce((sum, company) => sum + company[quarter], 0),
);
await updateSignal('revenue', {
	value: `$${billions(latestRevenue)}B`,
	change: signed(revenueChange),
	trend: series(revenueYears.slice(-10), revenueTrend),
	recent: recentOf(quarterlyTotals, 5),
	...reading(revenueChange, { up: 'Still growing', down: 'Shrinking' }, 'away'),
	rule: 'Still growing when combined revenue rises over the year. Shrinking revenue moves toward solved.',
	fromHigh: fromHighOf(revenueTrend),
});
const priceTrend = priceRows.map(({ index }) => index);
await updateSignal('prices', {
	value: latestPrice.index.toFixed(1),
	change: signed(priceChange),
	trend: series(priceRows.map(row => row.month), priceTrend),
	recent: recentOf(priceTrend, 13),
	...reading(priceChange, { up: 'Rising', down: 'Getting cheaper' }, 'away'),
	rule: 'Rising when the price index is higher than a year before. Falling prices move toward solved.',
	fromHigh: fromHighOf(priceTrend),
});
await updateSignal('agent-tools', {
	value: number(mcpRepos[mcpLatest]),
	change: signed(mcpChange),
	trend: series(mcpMonths, mcpTrend),
	recent: recentOf(mcpTrend, 13),
	...reading(mcpChange, { up: 'Expanding', down: 'Slowing' }, 'away'),
	rule: 'Expanding when more repos are created than in the same month a year before.',
	fromHigh: fromHighOf(mcpTrend),
});
await updateSignal('ai-company-jobs', {
	value: number(aiJobsLatest),
	...(aiJobsHiring.length > 0
		? { status: 'Still hiring', direction: 'away' }
		: { status: 'Not hiring', direction: 'toward' }),
	rule: 'Still hiring when any of these companies lists an open software engineering role.',
	metric: `Open software engineering roles at ${aiJobsRows.length} AI companies, today`,
	...(aiJobsTrend.length >= 2 ? { trend: series(Object.keys(aiJobsHistory).sort(), aiJobsTrend), trendLabel: 'Open software engineering roles, one point per count.' } : {}),
	analysis: {
		title: 'Who is hiring',
		intro: `${aiJobsHiring.length} of ${aiJobsRows.length} companies have open software engineering roles. Hiring does not show how much of their code AI writes.`,
		points: aiJobsRows.map(([name, { engineering, open }]) => `${name}: ${engineering} engineering roles, out of ${open} open roles.`),
	},
});
// The cheapest run within 5 points of the best FrontierSWE score, up to a goal of $1 a task.
const frontierRuns = parseCsv(await readFile('data/raw/benchmarks/frontierswe_external.csv', 'utf8'))
	.filter((row) => row.Score && row['Average cost (USD)'] && row['Release date'])
	.map((row) => ({ month: row['Release date'].slice(0, 7), model: row['Model version'].split('_')[0], score: Number(row.Score), cost: Number(row['Average cost (USD)']) }));
const frontierTopRun = frontierRuns.reduce((best, run) => (run.score > best.score ? run : best));
const taskCostRunAt = (month) => {
	const released = frontierRuns.filter((run) => run.month <= month);
	if (released.length === 0) return undefined;
	const top = Math.max(...released.map(({ score }) => score));
	return released.filter(({ score }) => score >= top - 0.05).reduce((best, run) => (run.cost < best.cost ? run : best));
};
const taskCostAt = (month) => {
	const run = taskCostRunAt(month);
	return run && toGoal(((3 - Math.log10(run.cost)) / 3) * 100);
};
const usd = (value) => `$${number(Math.round(value))}`;

await updateSignal('token-prices', {
	value: dollars(tokenPriceAt(tokenLatest)),
	change: signed(tokenChange),
	trend: series(pricedMonths, tokenTrend),
	recent: recentOf(tokenTrend, 13),
	...reading(tokenChange, { up: 'Rising', down: 'Getting cheaper' }, 'away'),
	rule: 'Getting cheaper when the median listed price is lower than a year before.',
	fromHigh: fromHighOf(tokenTrend),
	analysis: {
		title: 'Are prices falling per model?',
		intro: 'Mostly not. The median falls because newer, cheaper models arrive, not because existing models get repriced.',
		points: [
			`Of ${sameModels.length} models listed both in ${tokenYearAgo} and ${tokenLatest}, ${modelsUnchanged} kept their price, ${modelsCheaper.length} got cheaper and ${modelsPricier.length} got more expensive.`,
			'Cheaper tokens do not always mean cheaper work, because a task can use more tokens on a newer model.',
			`On the FrontierSWE benchmark, a hard task costs from about ${usd(taskCostRunAt(today.slice(0, 7)).cost)} of AI usage for a near-top score to about ${usd(frontierTopRun.cost)} for the top score.`,
			OPENCODE_NOTE,
		],
	},
	quote: {
		author: 'Dax Raad',
		role: 'co-founder of OpenCode',
		url: 'https://x.com/thdxr/status/2116527005801873662',
		image: '/quotes/dax-token-costs.png',
		text: 'with current token prices i wouldn\'t really say "cost of software is going to zero". our token cost is double our payroll which means even though we\'re 25 it\'s like we\'re 75. and i feel like our output is similar to a team of 75 pre-ai. we\'re just able to do it without all the downsides of a larger team. this is still a good thing. we couldn\'t hire 50 more people. so much overhead and impossible to retain a high bar',
	},
});
await updateSignal('product-launches', {
	value: number(launches[launchLatest]),
	change: signed(launchChange),
	trend: series(launchMonths, launchTrend),
	recent: recentOf(launchTrend, 13),
	...reading(launchChange, { up: 'More launches', down: 'Fewer launches' }, 'away'),
	rule: 'More launches when more products launch than in the same month a year before.',
	fromHigh: fromHighOf(launchTrend),
});
const pushTrend = quarters.map((quarter) => millions(pushes[quarter]));
await updateSignal('code-activity', {
	value: `${millions(pushes[latestQuarter])}M`,
	change: signed(pushChange),
	trend: series(quarters, pushTrend),
	events: CHATGPT_LAUNCH,
	recent: recentOf(pushTrend, 5),
	...reading(pushChange, { up: 'Git pushes increased', down: 'Git pushes decreased' }, 'away'),
	rule: 'Git pushes increased when pushes rise by at least 2% over the year.',
	fromHigh: fromHighOf(pushTrend),
});

for (const [id, asOf] of [
	['cisa-kev', formatDate(kevAsOf)],
	['pwn-watch', formatDate(pwn.generatedAt)],
	['nvd', formatDate(nvdAsOf)],
	['hibp', formatDate(hibpAsOf)],
	['exploit-db', formatDate(exploitAsOf)],
	['osv', formatDate(osvAsOf)],
	['indeed', formatDate(us.latest.date)],
	['bls', `May ${employmentYear}`],
	['hacker-news', lastThread.month],
	...Object.keys(STATUS_SOURCES).map((id) => [id, statusAsOf]),
	['sec', revenueYears.at(-1)],
	['bls-prices', latestPrice.month],
	['litellm', tokenMonths.at(-1)],
	['innovation-graph', latestQuarter],
	['npm', npmLatest],
	['fed-funds', rateLatestMonth],
	['github-mcp', mcpLatest],
	['uneed', launchLatest],
	['ai-company-jobs', formatDate(aiJobs.date)],
	['mcp-registry', registryLatest],
]) {
	const path = `src/content/sources/${id}.json`;
	await writeJson(path, { ...(await readJson(path)), checked: asOf });
}

console.log(`Security: ${last12} (${change >= 0 ? '+' : ''}${change}%), previous ${previous12}`);

// Coding benchmarks: the best score so far, by the month each model was released.
const benchmarkRows = async (file, column) =>
	parseCsv(await readFile(`data/raw/benchmarks/${file}`, 'utf8'))
		.filter((row) => row[column] && row['Release date'])
		.map((row) => ({ month: row['Release date'].slice(0, 7), model: row['Model version'].split('_')[0], score: Number(row[column]) }));
const bestRow = (rows) => rows.reduce((best, row) => (row.score > best.score ? row : best));
const sweRows = await benchmarkRows('swe_bench_verified.csv', 'mean_score');
const sweBest = bestRow(sweRows);
const swePercent = Math.round(sweBest.score * 100);
const sweFirst = sweRows.map(({ month }) => month).sort()[0];
const sweByMonth = {};
for (let month = sweFirst, best = 0; month <= statusAsOf; month = nextMonth(month)) {
	for (const row of sweRows) if (row.month === month) best = Math.max(best, row.score);
	sweByMonth[month] = Math.round(best * 100);
}
const sweMonths = Object.keys(sweByMonth);
const sweTrend = sweMonths.map((month) => sweByMonth[month]);
const sweYearAgo = sweByMonth[nextMonth(sweMonths.at(-1), -12)];
const sweChange = Math.round((swePercent / sweYearAgo - 1) * 100);
const otherBenchmarks = await Promise.all(
	[
		['MirrorCode', 'mirrorcode.csv', 'mean_score'],
		['DeepSWE', 'deepswe_external.csv', 'Pass@1'],
		['FrontierSWE', 'frontierswe_external.csv', 'Score'],
		['FrontierCode', 'frontiercode_external.csv', 'Main score'],
	].map(async ([name, file, column]) => ({ name, ...bestRow(await benchmarkRows(file, column)) })),
);
otherBenchmarks.sort((a, b) => b.score - a.score);
const metrResults = await readJson('data/raw/benchmarks/metr.json');
const metrBest = metrResults.reduce((best, row) => (row.estimate > best.estimate ? row : best));
const hours = (minutes) => Math.round(minutes / 60);
const metrPoint = `METR estimates the longest task a model completes half the time at about ${hours(metrBest.estimate)} hours of human work, with a range of ${hours(metrBest.low)} to ${hours(metrBest.high)} hours.`;
const benchmarkPercent = (score) => `${Math.round(score * 100)}%`;

await writeJson('data/index/epoch-benchmarks.json', {
	asOf: sweBest.month,
	stats: [
		{ label: 'SWE-bench Verified, best', value: `${swePercent}%` },
		...otherBenchmarks.slice(0, 3).map(({ name, score }) => ({ label: `${name}, best`, value: benchmarkPercent(score) })),
	],
	findings: [
		`The best SWE-bench Verified score is ${swePercent}%, from ${sweBest.model}.`,
		`Top scores on the other coding benchmarks here run from ${benchmarkPercent(otherBenchmarks.at(-1).score)} to ${benchmarkPercent(otherBenchmarks[0].score)}, so one benchmark does not settle the question.`,
	],
	tables: [
		{
			title: 'Best score by benchmark',
			columns: ['Benchmark', 'Best score', 'Model'],
			rows: [['SWE-bench Verified', `${swePercent}%`, sweBest.model], ...otherBenchmarks.map(({ name, score, model }) => [name, benchmarkPercent(score), model])],
		},
	],
});
await writeJson('data/index/metr.json', {
	asOf: statusAsOf,
	stats: [{ label: 'Highest estimate', value: `${hours(metrBest.estimate)} hours` }],
	findings: [metrPoint],
	tables: [],
});
for (const [id, asOf] of [['epoch-benchmarks', sweBest.month], ['metr', statusAsOf]]) {
	const path = `src/content/sources/${id}.json`;
	await writeJson(path, { ...(await readJson(path)), checked: asOf });
}
await updateSignal('coding-benchmarks', {
	value: `${swePercent}%`,
	change: signed(sweChange),
	trend: series(sweMonths, sweTrend),
	recent: recentOf(sweTrend, 13),
	status: sweChange > 0 ? 'Improving' : 'Flat',
	direction: sweChange > 0 ? 'toward' : 'flat',
	rule: 'Improving when the best score is higher than a year before.',
	fromHigh: fromHighOf(sweTrend),
	analysis: {
		title: 'Other public benchmarks',
		intro: 'The best score depends heavily on the benchmark, so no single number settles this.',
		points: [
			...otherBenchmarks.map(({ name, score, model }) => `${name}: ${benchmarkPercent(score)}, from ${model}.`),
			metrPoint,
		],
	},
});

// Coding agents: public pull requests from accounts and branches that identify an agent.
const agentMonths = await readJson('data/raw/agent-prs/monthly.json');
const AGENT_NAMES = ['Codex', 'Copilot', 'Devin', 'Cursor', 'Claude', 'Jules'];
const agentTotal = (month) => AGENT_NAMES.reduce((sum, name) => sum + agentMonths[month][name], 0);
const agentList = Object.keys(agentMonths).sort().filter((month) => month < today.slice(0, 7));
const agentLatest = agentList.at(-1);
const agentYearAgo = nextMonth(agentLatest, -12);
const agentChange = Math.round((agentTotal(agentLatest) / agentTotal(agentYearAgo) - 1) * 100);
const agentShareAt = (month) => (agentTotal(month) / agentMonths[month].all) * 100;
const agentShare = Object.fromEntries(agentList.map((month) => [month, agentShareAt(month)]));
const agentTrend = agentList.map(agentTotal);
const oneDecimal = (value) => Math.round(value * 10) / 10;
const millionsOne = (value) => `${oneDecimal(value / 1e6)}M`;
const agentRanked = AGENT_NAMES.map((name) => [name, agentMonths[agentLatest][name]]).sort((a, b) => b[1] - a[1]);

await writeJson('data/index/agent-prs.json', {
	asOf: agentLatest,
	stats: [
		{ label: `Agent pull requests, ${agentLatest}`, value: millionsOne(agentTotal(agentLatest)) },
		{ label: 'Year over year', value: signed(agentChange) },
		{ label: 'Share of public pull requests', value: `${oneDecimal(agentShareAt(agentLatest))}%` },
		{ label: 'All public pull requests', value: millionsOne(agentMonths[agentLatest].all) },
	],
	findings: [
		`${number(agentTotal(agentLatest))} public pull requests in ${agentLatest} clearly came from coding agents, ${signed(agentChange)} on a year earlier.`,
		`That is ${oneDecimal(agentShareAt(agentLatest))}% of all public pull requests, against ${oneDecimal(agentShareAt(agentYearAgo))}% a year earlier, because all public pull requests grew from ${millionsOne(agentMonths[agentYearAgo].all)} to ${millionsOne(agentMonths[agentLatest].all)}.`,
		'Agents working under a person\'s account look human here, and they may explain part of that wider growth, but this data cannot show it.',
	],
	tables: [
		{
			title: `By agent, ${agentLatest}`,
			columns: ['Agent', 'Pull requests', 'A year earlier'],
			rows: agentRanked.map(([name, count]) => [name, count, agentMonths[agentYearAgo][name]]),
		},
	],
});
{
	const path = 'src/content/sources/agent-prs.json';
	await writeJson(path, { ...(await readJson(path)), checked: agentLatest });
}
await updateSignal('agent-prs', {
	value: millionsOne(agentTotal(agentLatest)),
	change: signed(agentChange),
	trend: series(agentList, agentTrend),
	recent: recentOf(agentTrend, 13),
	...reading(agentChange, { up: 'More agents', down: 'Fewer agents' }, 'toward'),
	rule: 'More agents when more agent pull requests are opened than in the same month a year before.',
	fromHigh: fromHighOf(agentTrend),
	trendLabel: 'Public GitHub pull requests from identifiable coding agents, per month.',
	analysis: {
		title: 'Which agents',
		intro: `These are ${oneDecimal(agentShareAt(agentLatest))}% of all public pull requests, against ${oneDecimal(agentShareAt(agentYearAgo))}% a year earlier.`,
		points: agentRanked.map(([name, count]) => `${name}: ${number(count)}, against ${number(agentMonths[agentYearAgo][name])} a year earlier.`),
	},
});

// No-code: combined annual revenue of the public companies, only for years both reported.
const noCode = await readJson('data/raw/no-code/revenue.json');
const noCodeNames = Object.keys(noCode);
const noCodeYears = Object.keys(noCode[noCodeNames[0]]).filter((year) => noCodeNames.every((name) => noCode[name][year])).sort();
const noCodeTotal = (year) => noCodeNames.reduce((sum, name) => sum + noCode[name][year], 0);
const noCodeLatest = noCodeYears.at(-1);
const noCodePrevious = noCodeYears.at(-2);
const noCodeChange = Math.round((noCodeTotal(noCodeLatest) / noCodeTotal(noCodePrevious) - 1) * 100);
const billionsOne = (value) => `$${Math.round(value / 1e8) / 10}B`;
const noCodeTrend = noCodeYears.slice(-10).map((year) => Math.round(noCodeTotal(year) / 1e8) / 10);
const noCodeByMonth = Object.fromEntries(noCodeYears.map((year) => [`${year}-12`, noCodeTotal(year)]));

await writeJson('data/index/no-code-sec.json', {
	asOf: noCodeLatest,
	stats: [
		{ label: `Combined revenue, ${noCodeLatest}`, value: billionsOne(noCodeTotal(noCodeLatest)) },
		{ label: 'Year over year', value: signed(noCodeChange) },
		...noCodeNames.map((name) => ({ label: `${name}, ${noCodeLatest}`, value: billionsOne(noCode[name][noCodeLatest]) })),
	],
	findings: [
		`Wix and Shopify earned ${billionsOne(noCodeTotal(noCodeLatest))} in ${noCodeLatest}, ${signed(noCodeChange)} on the year before.`,
		'Most of this is not a direct measure of building without code, especially at Shopify.',
	],
	tables: [
		{
			title: 'Revenue per year',
			columns: ['Year', ...noCodeNames, 'Combined'],
			rows: noCodeYears.slice(-6).map((year) => [year, ...noCodeNames.map((name) => billionsOne(noCode[name][year])), billionsOne(noCodeTotal(year))]),
		},
	],
});
{
	const path = 'src/content/sources/no-code-sec.json';
	await writeJson(path, { ...(await readJson(path)), checked: noCodeLatest });
}

// HTTP Archive: AI builder counts as the headline, and platforms as shares of the sites crawled, because the crawl list changes size.
const siteAdoption = await readJson('data/raw/http-archive/adoption.json');
const siteMonths = Object.keys(siteAdoption.ALL.ALL).sort();
const siteLatest = siteMonths.at(-1);
const siteYearAgo = nextMonth(siteLatest, -12);
const siteShare = (rank, technology, month) => ((siteAdoption[rank][technology][month] ?? 0) / siteAdoption[rank].ALL[month]) * 100;
const shareLabel = (value) => `${value.toFixed(1)}%`;
const SITE_PLATFORMS = ['WordPress', 'Shopify', 'Wix', 'Squarespace', 'Webflow', 'Framer Sites'];
const AI_BUILDERS = ['Lovable', 'Emergent'];
const builderSites = (month) => AI_BUILDERS.reduce((sum, name) => sum + (siteAdoption.ALL[name][month] ?? 0), 0);
const builderStart = siteMonths.find((month) => builderSites(month) > 0);
const describeWordPress = (rank, name) => `${shareLabel(siteShare(rank, 'WordPress', siteLatest))} of ${name} in ${siteLatest}, against ${shareLabel(siteShare(rank, 'WordPress', siteYearAgo))} a year earlier`;

await writeJson('data/index/http-archive.json', {
	asOf: siteLatest,
	stats: [
		{ label: `WordPress, top 1M sites, ${siteLatest}`, value: shareLabel(siteShare('Top 1M', 'WordPress', siteLatest)) },
		{ label: `WordPress, all crawled sites, ${siteLatest}`, value: shareLabel(siteShare('ALL', 'WordPress', siteLatest)) },
		{ label: `Lovable and Emergent sites, ${siteLatest}`, value: number(builderSites(siteLatest)) },
	],
	findings: [
		`WordPress ran ${describeWordPress('Top 1M', 'the top 1 million sites')}, and ${describeWordPress('ALL', 'all crawled sites')}. This data shows the fall, not its cause.`,
		`Lovable and Emergent went from ${number(builderSites(builderStart))} crawled sites in ${builderStart} to ${number(builderSites(siteLatest))} in ${siteLatest}, against ${number(siteAdoption.ALL.WordPress[siteLatest])} on WordPress. The crawl only lists sites with enough Chrome traffic, so this undercounts them.`,
	],
	tables: [
		{
			title: `Share of crawled sites, ${siteLatest} against a year earlier`,
			columns: ['Platform', 'Top 1M', 'A year earlier', 'All sites', 'A year earlier'],
			rows: SITE_PLATFORMS.map((name) => [name, shareLabel(siteShare('Top 1M', name, siteLatest)), shareLabel(siteShare('Top 1M', name, siteYearAgo)), shareLabel(siteShare('ALL', name, siteLatest)), shareLabel(siteShare('ALL', name, siteYearAgo))]),
		},
		{
			title: 'Sites detected on AI app builders',
			columns: ['Month', ...AI_BUILDERS],
			rows: siteMonths.filter((month) => month >= builderStart).map((month) => [month, ...AI_BUILDERS.map((name) => number(siteAdoption.ALL[name][month] ?? 0))]),
		},
	],
});
{
	const path = 'src/content/sources/http-archive.json';
	await writeJson(path, { ...(await readJson(path)), checked: siteLatest });
}
const builderMonths = siteMonths.filter((month) => month >= builderStart);
const builderByMonth = Object.fromEntries(builderMonths.map((month) => [month, builderSites(month)]));
const builderTrend = builderMonths.map((month) => builderByMonth[month]);
await updateSignal('ai-built-sites', {
	value: number(builderSites(siteLatest)),
	// Cards label this as year over year, so it waits for a year of data.
	change: builderByMonth[siteYearAgo] ? signed(Math.round((builderSites(siteLatest) / builderByMonth[siteYearAgo] - 1) * 100)) : undefined,
	trend: series(builderMonths, builderTrend),
	recent: recentOf(builderTrend, 13),
	...reading(Math.round((builderSites(siteLatest) / builderTrend.at(-4) - 1) * 100), { up: 'Growing', down: 'Shrinking' }, 'toward'),
	rule: 'Growing when more sites are detected than three months before.',
	fromHigh: fromHighOf(builderTrend),
	analysis: {
		title: 'What is happening to WordPress',
		intro: 'WordPress is losing share of the web, but this data shows the fall, not its cause, and AI builders are far too small to explain it.',
		points: [
			`WordPress ran ${describeWordPress('Top 1M', 'the top 1 million sites')}.`,
			`It ran ${describeWordPress('ALL', 'all crawled sites')}.`,
			`Sites on Lovable and Emergent are ${number(builderSites(siteLatest))}, against ${number(siteAdoption.ALL.WordPress[siteLatest])} on WordPress.`,
		],
	},
});
await updateSignal('no-code-revenue', {
	value: billionsOne(noCodeTotal(noCodeLatest)),
	change: signed(noCodeChange),
	trend: series(noCodeYears.slice(-10), noCodeTrend),
	recent: noCodeTrend.slice(-5).map((value, i, list) => Math.round((value / list[0]) * 1000) / 10),
	...reading(noCodeChange, { up: 'Still growing', down: 'Shrinking' }, 'toward'),
	rule: 'Still growing when combined revenue is higher than the year before.',
	fromHigh: fromHighOf(noCodeTrend),
});

// Stack Overflow: questions asked per month.
const soMonths = await readJson('data/raw/stack-overflow/monthly.json');
const soList = Object.keys(soMonths).sort().filter((month) => month < today.slice(0, 7));
const soLatest = soList.at(-1);
const soYearAgo = nextMonth(soLatest, -12);
const soChange = Math.round((soMonths[soLatest] / soMonths[soYearAgo] - 1) * 100);
const soTrend = soList.map((month) => soMonths[month]);
const soBaseline = soMonths['2022-11'];

await writeJson('data/index/stack-overflow.json', {
	asOf: soLatest,
	stats: [
		{ label: `Questions, ${soLatest}`, value: soMonths[soLatest] },
		{ label: 'Year over year', value: signed(soChange) },
		{ label: 'November 2022', value: soBaseline },
	],
	findings: [
		`${number(soMonths[soLatest])} questions were asked in ${soLatest}, against ${number(soMonths[soYearAgo])} a year earlier and ${number(soBaseline)} when ChatGPT launched in November 2022.`,
		'Questions were already falling before ChatGPT, so AI is only one possible cause.',
	],
	tables: [
		{
			title: 'Questions, September of each year',
			columns: ['Year', 'Questions'],
			rows: soList.filter((month) => month.endsWith('-09')).map((month) => [month.slice(0, 4), soMonths[month]]),
		},
	],
});
{
	const path = 'src/content/sources/stack-overflow.json';
	await writeJson(path, { ...(await readJson(path)), checked: soLatest });
}
await updateSignal('stack-overflow', {
	value: number(soMonths[soLatest]),
	change: signed(soChange),
	trend: series(soList, soTrend),
	events: CHATGPT_LAUNCH,
	recent: recentOf(soTrend, 13),
	...reading(soChange, { up: 'Asking more', down: 'Asking less' }, 'away'),
	rule: 'Asking less when fewer questions are asked than in the same month a year before.',
	fromHigh: fromHighOf(soTrend),
});

// Output per tech worker: US information sector, compared with its pre-pandemic trend.
const tech = await readJson('data/raw/tech-output/series.json');
const quarterEmployment = (month) => {
	const months = [0, 1, 2].map((offset) => nextMonth(month, offset)).filter((key) => tech.employment[key]);
	return months.length === 3 ? months.reduce((sum, key) => sum + tech.employment[key], 0) / 3 : undefined;
};
const techMonths = Object.keys(tech.output).sort().filter((month) => quarterEmployment(month));
const perWorker = Object.fromEntries(techMonths.map((month) => [month, tech.output[month] / quarterEmployment(month)]));
const TECH_BASE = '2022-10';
const TREND_FROM = '2015-01';
const TREND_TO = '2019-10';
const yearsBetween = (from, to) => (Date.parse(`${to}-01`) - Date.parse(`${from}-01`)) / (365.25 * DAY);
const techYearly = (perWorker[TREND_TO] / perWorker[TREND_FROM]) ** (1 / yearsBetween(TREND_FROM, TREND_TO));
const aboveTrend = (month) => perWorker[month] / (perWorker[TREND_TO] * techYearly ** yearsBetween(TREND_TO, month));
const indexOf = (value, base) => Math.round((value / base) * 1000) / 10;
const techLatest = techMonths.at(-1);
const techYearAgo = nextMonth(techLatest, -12);
const techChange = Math.round((perWorker[techLatest] / perWorker[techYearAgo] - 1) * 100);
const techChart = techMonths.filter((month) => month >= '2019-01');
const techPerWorkerTrend = techMonths.filter((month) => month >= '2019-01').map((month) => indexOf(perWorker[month], perWorker[TECH_BASE]));
const quarterName = (month) => `Q${Math.ceil(Number(month.slice(5, 7)) / 3)} ${month.slice(0, 4)}`;
const techIndex = indexOf(perWorker[techLatest], perWorker[TECH_BASE]);
const outputGain = Math.round((tech.output[techLatest] / tech.output[TECH_BASE] - 1) * 100);
const workersChange = Math.round((quarterEmployment(techLatest) / quarterEmployment(TECH_BASE) - 1) * 100);
const techAbove = Math.round((aboveTrend(techLatest) - 1) * 100);
const techYearlyPercent = Math.round((techYearly - 1) * 100);

await writeJson('data/index/tech-output.json', {
	asOf: quarterName(techLatest),
	stats: [
		{ label: 'Output per worker, Q4 2022 = 100', value: techIndex },
		{ label: 'Output since Q4 2022', value: signed(outputGain) },
		{ label: 'Workers since Q4 2022', value: signed(workersChange) },
		{ label: 'Above the earlier trend', value: signed(techAbove) },
	],
	findings: [
		`Since ${quarterName(TECH_BASE)}, US information sector output is ${signed(outputGain)} and employment is ${signed(workersChange)}, so output per worker reached ${techIndex}.`,
		`Output per worker already grew about ${techYearlyPercent}% a year from 2015 to 2019. The latest figure is ${signed(techAbove)} against that trend.`,
	],
	tables: [],
});
{
	const path = 'src/content/sources/tech-output.json';
	await writeJson(path, { ...(await readJson(path)), checked: quarterName(techLatest) });
}
await updateSignal('tech-output', {
	value: String(techIndex),
	change: signed(techChange),
	trend: series(techChart, techChart.map((month) => indexOf(tech.output[month], tech.output[TECH_BASE]))),
	trendName: 'Real output',
	comparison: { name: 'Employment', sameAxis: true, trend: series(techChart, techChart.map((month) => indexOf(quarterEmployment(month), quarterEmployment(TECH_BASE)))) },
	events: [{ month: '2022-11', label: 'ChatGPT' }],
	recent: recentOf(techPerWorkerTrend, 5),
	...reading(techChange, { up: 'More per worker', down: 'Less per worker' }, 'toward'),
	rule: 'More per worker when output per worker is higher than a year before.',
	fromHigh: fromHighOf(techPerWorkerTrend),
	analysis: {
		title: 'What the numbers show',
		intro: `Output is ${signed(outputGain)} and employment is ${signed(workersChange)} since ${quarterName(TECH_BASE)}, but most of the gain follows an older trend.`,
		points: [
			`Output per worker already grew about ${techYearlyPercent}% a year from 2015 to 2019.`,
			`The latest figure is ${signed(techAbove)} against that trend, and that gap is what counts toward the score.`,
		],
	},
});

// OpenRouter: tokens used per model. Published figures are our monthly totals, with credit.
const openRouter = await readJson('data/raw/openrouter/monthly.json');
const routerMonths = Object.keys(openRouter.months).sort().filter((month) => month < today.slice(0, 7));
const routerTotal = (month) => Object.values(openRouter.months[month]).reduce((sum, tokens) => sum + tokens, 0);
const routerLatest = routerMonths.at(-1);
const routerYearAgo = nextMonth(routerLatest, -12);
const routerChange = Math.round((routerTotal(routerLatest) / routerTotal(routerYearAgo) - 1) * 100);
const routerTrend = routerMonths.map((month) => Math.round(routerTotal(month) / 1e12));
const routerByMonth = Object.fromEntries(routerMonths.map((month) => [month, routerTotal(month)]));
const trillions = (value) => `${number(Math.round(value / 1e12))}T`;
const routerModel = (model) => model.replace(/-20\d{6}/, '').replace(/-\d{4}$/, '');
// Dated releases of one model share a name once the date is dropped, so they count together.
const routerByModel = {};
for (const [model, tokens] of Object.entries(openRouter.months[routerLatest])) {
	if (model !== 'other') routerByModel[routerModel(model)] = (routerByModel[routerModel(model)] ?? 0) + tokens;
}
const routerTop = Object.entries(routerByModel).sort((a, b) => b[1] - a[1]).slice(0, 5);
const routerGrowth = Math.round(routerTotal(routerLatest) / routerTotal(routerMonths[0]));
const routerCredit = `Source: OpenRouter (openrouter.ai/rankings), as of ${openRouter.asOf}. Licensed under CC BY 4.0.`;

await writeJson('data/index/openrouter.json', {
	asOf: routerLatest,
	stats: [
		{ label: `Tokens, ${routerLatest}`, value: trillions(routerTotal(routerLatest)) },
		{ label: 'Year over year', value: signed(routerChange) },
		{ label: `Since ${routerMonths[0]}`, value: `${routerGrowth}x` },
	],
	findings: [`Tokens used through OpenRouter reached ${trillions(routerTotal(routerLatest))} in ${routerLatest}, against ${trillions(routerTotal(routerYearAgo))} a year earlier.`],
	tables: [
		{
			title: `Most used models, ${routerLatest}`,
			columns: ['Model', 'Tokens', 'Share'],
			rows: routerTop.map(([model, tokens]) => [model, trillions(tokens), `${percent(tokens, routerTotal(routerLatest))}%`]),
		},
	],
});
{
	const path = 'src/content/sources/openrouter.json';
	await writeJson(path, { ...(await readJson(path)), attribution: routerCredit, checked: routerLatest });
}
await updateSignal('token-usage', {
	value: trillions(routerTotal(routerLatest)),
	change: signed(routerChange),
	trend: series(routerMonths, routerTrend),
	recent: recentOf(routerTrend, 13),
	...reading(routerChange, { up: 'Growing', down: 'Shrinking' }, 'toward'),
	rule: 'Growing when more tokens are used than in the same month a year before.',
	fromHigh: fromHighOf(routerTrend),
	analysis: {
		title: 'Most used models',
		intro: `The top five of ${routerLatest} account for ${percent(routerTop.reduce((sum, [, tokens]) => sum + tokens, 0), routerTotal(routerLatest))}% of all tokens, and the largest alone for ${percent(routerTop[0][1], routerTotal(routerLatest))}%.`,
		points: routerTop.map(([model, tokens]) => `${model}: ${trillions(tokens)}, ${percent(tokens, routerTotal(routerLatest))}% of all tokens.`),
	},
});

// OpenRouter by use: programming's share of tokens, and tokens through ranked coding apps.
const shareMonths = routerMonths.filter((month) => openRouter.programming[month] && month >= '2025-05');
const shareOf = (month) => Math.min(100, (openRouter.programming[month] / routerTotal(month)) * 100);
const shareLatest = shareMonths.at(-1);
const shareTrend = shareMonths.map((month) => Math.round(shareOf(month)));
const shareYearAgo = nextMonth(shareLatest, -12);
const shareChange = Math.round((shareOf(shareLatest) / shareOf(shareYearAgo) - 1) * 100);
const shareByMonth = Object.fromEntries(shareMonths.map((month) => [month, shareOf(month)]));
const codingTotal = (month) => Object.values(openRouter.coding[month]).reduce((sum, tokens) => sum + tokens, 0);
const codingMonths = Object.keys(openRouter.coding).sort().filter((month) => codingTotal(month) > 0 && month < today.slice(0, 7));
const codingLatest = codingMonths.at(-1);
const codingYearAgo = nextMonth(codingLatest, -12);
const codingChange = Math.round((codingTotal(codingLatest) / codingTotal(codingYearAgo) - 1) * 100);
const codingTrend = codingMonths.map((month) => Math.round((codingTotal(month) / 1e12) * 10) / 10);
const codingByMonth = Object.fromEntries(codingMonths.map((month) => [month, codingTotal(month)]));
const codingTop = Object.entries(openRouter.coding[codingLatest]).sort((a, b) => b[1] - a[1]).slice(0, 5);
const codingGrowth = Math.round(codingTotal(codingLatest) / codingTotal(codingMonths[0]));
const routerCategoryCredit = `Source: OpenRouter (openrouter.ai/rankings), as of ${openRouter.asOf}. Licensed under CC BY 4.0.`;
await writeJson('data/index/openrouter-categories.json', {
	asOf: shareLatest,
	stats: [
		{ label: `Programming share, ${shareLatest}`, value: `${Math.round(shareOf(shareLatest))}%` },
		{ label: `Coding app tokens, ${codingLatest}`, value: trillions(codingTotal(codingLatest)) },
	],
	findings: [`About ${Math.round(shareOf(shareLatest))}% of OpenRouter tokens in ${shareLatest} were estimated to be programming.`, `Ranked coding apps used ${trillions(codingTotal(codingLatest))} tokens in ${codingLatest}.`],
	tables: [{ title: `Most used coding apps, ${codingLatest}`, columns: ['App', 'Tokens'], rows: codingTop.map(([name, tokens]) => [name, trillions(tokens)]) }],
});
await updateSignal('programming-share', {
	value: `${Math.round(shareOf(shareLatest))}%`,
	change: signed(shareChange),
	trend: series(shareMonths, shareTrend),
	recent: shareTrend.slice(-13),
	...reading(shareChange, { up: 'Rising', down: 'Falling' }, 'toward'),
	rule: 'Rising when programming takes a larger share of tokens than a year before.',
	fromHigh: fromHighOf(shareTrend),
});
await updateSignal('coding-agents', {
	value: trillions(codingTotal(codingLatest)),
	change: signed(codingChange),
	trend: series(codingMonths, codingTrend),
	recent: recentOf(codingTrend, 13),
	...reading(codingChange, { up: 'Growing', down: 'Shrinking' }, 'toward'),
	rule: 'Growing when ranked coding apps use more tokens than in the same month a year before.',
	fromHigh: fromHighOf(codingTrend),
	analysis: {
		title: 'Most used coding apps',
		intro: `The top five of ${codingLatest}.`,
		points: codingTop.map(([name, tokens]) => `${name}: ${trillions(tokens)}.`),
	},
});

// Bugs: new published vulnerabilities, rolling 12 months.
const cveMonthly = countBy(cves, ({ published }) => published.slice(0, 7));
const cveMonths = Object.keys(cveMonthly).sort().filter((month) => month < today.slice(0, 7));
const cveRolling = (month) => {
	let total = 0;
	for (let key = nextMonth(month, -11); key <= month; key = nextMonth(key)) total += cveMonthly[key] ?? 0;
	return total;
};
const bugMonths = cveMonths.filter((month) => month >= '2019-12');
const bugByMonth = Object.fromEntries(bugMonths.map((month) => [month, cveRolling(month)]));
const bugLatest = bugMonths.at(-1);
const bugChange = Math.round((cveRolling(bugLatest) / cveRolling(nextMonth(bugLatest, -12)) - 1) * 100);
const bugTrend = bugMonths.map(cveRolling);
await updateSignal('bugs', {
	value: number(cveRolling(bugLatest)),
	change: signed(bugChange),
	trend: series(bugMonths, bugTrend),
	chartNote: PER_PUSH_NOTE,
	recent: recentOf(bugTrend, 13),
	...reading(bugChange, { up: 'More reported', down: 'Fewer reported' }, 'away'),
	rule: 'More reported when more vulnerabilities are published than in the 12 months before.',
	fromHigh: fromHighOf(bugTrend),
});

// US government series: software investment, job openings and business applications.
const economy = await readJson('data/raw/economy/series.json');
const spendMonths = Object.keys(economy.softwareInvestment).sort();
const spendLatest = spendMonths.at(-1);
const spendChange = Math.round((economy.softwareInvestment[spendLatest] / economy.softwareInvestment[nextMonth(spendLatest, -12)] - 1) * 100);
const spendTrend = spendMonths.filter((month) => month >= '2016').map((month) => Math.round(economy.softwareInvestment[month]));
await writeJson('data/index/economy-spending.json', {
	asOf: quarterName(spendLatest),
	stats: [
		{ label: `Investment, ${quarterName(spendLatest)}`, value: `$${Math.round(economy.softwareInvestment[spendLatest])}B` },
		{ label: 'Year over year', value: signed(spendChange) },
	],
	findings: [`US businesses invested about $${Math.round(economy.softwareInvestment[spendLatest])}B a year in software in ${quarterName(spendLatest)}, in 2017 dollars, ${signed(spendChange)} on a year earlier.`],
	tables: [],
});
await updateSignal('software-spending', {
	value: `$${Math.round(economy.softwareInvestment[spendLatest])}B`,
	change: signed(spendChange),
	trend: series(spendMonths.filter(month => month >= '2016'), spendTrend),
	recent: recentOf(spendTrend, 5),
	...reading(spendChange, { up: 'Still rising', down: 'Falling' }, 'away'),
	rule: 'Still rising when real investment is higher than a year before.',
	fromHigh: fromHighOf(spendTrend),
});
const rollingAverage = (series, month) => {
	const values = [];
	for (let key = nextMonth(month, -11); key <= month; key = nextMonth(key)) if (series[key] !== undefined) values.push(series[key]);
	return values.length === 12 ? values.reduce((sum, value) => sum + value, 0) / 12 : undefined;
};
const BASELINE_MONTH = '2022-11';
const softwareOnDay = (date) => us.rows.find((row) => row.date === date).index;
const joltsMonths = Object.keys(economy.openings).sort().filter((month) => rollingAverage(economy.openings, month) !== undefined);
const openingsByMonth = Object.fromEntries(joltsMonths.map((month) => [month, rollingAverage(economy.openings, month)]));
const joltsLatest = joltsMonths.at(-1);
const joltsYearAgo = nextMonth(joltsLatest, -12);
const joltsChange = Math.round((openingsByMonth[joltsLatest] / openingsByMonth[joltsYearAgo] - 1) * 100);
const openingsTrend = joltsMonths.filter((month) => month >= '2019-12').map((month) => Math.round(openingsByMonth[month]));
const hiresNow = Math.round(rollingAverage(economy.hires, joltsLatest));
const layoffsNow = Math.round(rollingAverage(economy.layoffs, joltsLatest));
await writeJson('data/index/economy-jolts.json', {
	asOf: joltsLatest,
	stats: [
		{ label: 'Openings, 12-month average', value: `${Math.round(openingsByMonth[joltsLatest])}K` },
		{ label: 'Hires, 12-month average', value: `${hiresNow}K` },
		{ label: 'Layoffs, 12-month average', value: `${layoffsNow}K` },
	],
	findings: [`Over the last 12 months, the US information sector averaged ${Math.round(openingsByMonth[joltsLatest])}K openings, ${hiresNow}K hires and ${layoffsNow}K layoffs a month.`],
	tables: [],
});
await updateSignal('tech-hiring', {
	value: `${Math.round(openingsByMonth[joltsLatest])}K`,
	change: signed(joltsChange),
	trend: series(joltsMonths.filter(month => month >= '2019-12'), openingsTrend),
	recent: recentOf(openingsTrend, 13),
	...reading(joltsChange, { up: 'Hiring more', down: 'Hiring less' }, 'away'),
	rule: 'Hiring more when average openings are higher than a year before.',
	name: 'Information sector openings',
	question: 'Is the wider tech and media sector hiring?',
	fromHigh: fromHighOf(openingsTrend),
	analysis: {
		title: 'How this fits with Jobs',
		intro: 'Both show a big fall since 2022. They differ over the last year because they measure different things.',
		points: [
			`Since ChatGPT launched, average openings here are down ${Math.abs(Math.round((openingsByMonth[joltsLatest] / openingsByMonth[BASELINE_MONTH] - 1) * 100))}%, and Indeed's software postings are down ${Math.abs(Math.round((us.latest.index / softwareOnDay('2022-11-01') - 1) * 100))}%.`,
			`The Jobs signal counts software roles on Indeed, up ${us.change}% in a year. This one covers the whole sector, including telecoms, publishing and media, and averages 12 noisy months, so it reacts more slowly.`,
			`The sector averaged ${hiresNow}K hires and ${layoffsNow}K layoffs a month over the same 12 months.`,
		],
	},
});
const applications = economy.businessApplications;
const applicationMonths = Object.keys(applications).sort().filter((month) => month >= '2016');
const applicationLatest = applicationMonths.at(-1);
const applicationChange = Math.round((applications[applicationLatest] / applications[nextMonth(applicationLatest, -12)] - 1) * 100);
const applicationTrend = applicationMonths.map((month) => applications[month]);
await writeJson('data/index/census-bfs.json', {
	asOf: applicationLatest,
	stats: [
		{ label: `Applications, ${applicationLatest}`, value: applications[applicationLatest] },
		{ label: 'Year over year', value: signed(applicationChange) },
	],
	findings: [`${number(applications[applicationLatest])} new information sector business applications were filed in ${applicationLatest}, ${signed(applicationChange)} on a year earlier.`],
	tables: [],
});
await updateSignal('new-businesses', {
	value: number(applications[applicationLatest]),
	change: signed(applicationChange),
	trend: series(applicationMonths, applicationTrend),
	recent: recentOf(applicationTrend, 13),
	...reading(applicationChange, { up: 'More applications', down: 'Fewer applications' }, 'toward'),
	rule: 'More applications when more are filed than in the same month a year before.',
	fromHigh: fromHighOf(applicationTrend),
});
for (const [id, checked, extra] of [
	['openrouter-categories', shareLatest, { attribution: routerCategoryCredit }],
	['economy-spending', quarterName(spendLatest), {}],
	['economy-jolts', joltsLatest, {}],
	['census-bfs', applicationLatest, {}],
	['nyfed-graduates', '2026 release', {}],
]) {
	const path = `src/content/sources/${id}.json`;
	await writeJson(path, { ...(await readJson(path)), ...extra, checked });
}
// Repositories and developers add context to code activity.
const repositories = await quarterTotals('repositories', 'repositories');
await updateSignal('code-activity', {
	analysis: {
		title: 'Repositories and developers',
		intro: `GitHub activity in ${latestQuarter} and a year earlier.`,
		points: [
			`${millions(repositories[latestQuarter])}M repositories saw activity, against ${millions(repositories[quarterYearAgo])}M.`,
			`${millions(developers[latestQuarter])}M developers, against ${millions(developers[quarterYearAgo])}M.`,
		],
	},
});

// What AI models say: opinions from runs by hand, shown separately and left out of the score.
const modelRun = await readJson('data/raw/model-opinions/answers.json');
const middle = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};
const modelScores = modelRun.answers
	.filter(({ runs }) => runs.length > 0)
	.map(({ name, released, runs }) => ({ name: name.replace(/^[^:]+:\s*/, ''), released, score: middle(runs.map(({ score }) => score)) }));
const modelMedian = middle(modelScores.map(({ score }) => score));
const modelTrend = modelScores.map(({ score }) => score);
const modelHigh = modelScores.reduce((best, model) => (model.score > best.score ? model : best));
await writeJson('data/index/model-opinions.json', {
	asOf: formatDate(modelRun.asked),
	stats: [
		{ label: 'Median answer', value: `${modelMedian}%` },
		{ label: 'Models', value: modelScores.length },
	],
	findings: [`Last asked on ${formatDate(modelRun.asked)}, ${modelScores.length} AI models gave a median score of ${modelMedian}%.`],
	tables: [
		{
			title: 'Answers by model',
			columns: ['Model', 'Released', 'Median answer'],
			rows: modelScores.map(({ name, released, score }) => [name, released, `${score}%`]),
		},
	],
});
{
	const path = 'src/content/sources/model-opinions.json';
	await writeJson(path, { ...(await readJson(path)), checked: formatDate(modelRun.asked) });
}
await updateSignal('model-opinions', {
	value: `${modelMedian}%`,
	trend: series(modelScores.map(model => model.name), modelTrend),
	trendScale: 'category',
	recent: modelTrend.slice(-13),
	status: modelMedian >= 50 ? 'Say it is close' : 'Say not yet',
	direction: modelMedian >= 50 ? 'toward' : 'away',
	rule: 'Say not yet when the median answer is under 50.',
	fromHigh: undefined,
	prompt: modelRun.prompt,
	analysis: {
		title: 'Answers by model',
		intro: `Each model was asked once, most recently on ${formatDate(modelRun.asked)}. Oldest model first. No model scored above ${modelHigh.score}%.`,
		points: modelScores.map(({ name, released, score }) => `${name} (${released}): ${score}%.`),
	},
});

// Software outsourcing: combined revenue, and revenue per employee from hand-entered headcounts.
const outsourcing = await readJson('data/raw/outsourcing/revenue.json');
const headcount = (await readJson('data/outsourcing-headcount.json')).companies;
const outsourcers = Object.keys(outsourcing);
const outsourcingYears = Object.keys(outsourcing[outsourcers[0]]).filter((year) => year >= '2018' && outsourcers.every((name) => outsourcing[name][year])).sort();
const outsourcingTotal = (year) => outsourcers.reduce((sum, name) => sum + outsourcing[name][year], 0);
const outsourcingLatest = outsourcingYears.at(-1);
const outsourcingChange = Math.round((outsourcingTotal(outsourcingLatest) / outsourcingTotal(outsourcingYears.at(-2)) - 1) * 100);
const outsourcingTrend = outsourcingYears.map((year) => Math.round(outsourcingTotal(year) / 1e9));
const outsourcingByMonth = Object.fromEntries(outsourcingYears.map((year) => [`${year}-12`, outsourcingTotal(year)]));
const employeesIn = (year) => outsourcers.reduce((sum, name) => sum + headcount[name][year], 0);
const perEmployee = (year) => outsourcingTotal(year) / employeesIn(year);
const employeeChange = signed(Math.round((employeesIn('2025') / employeesIn('2023') - 1) * 100));
const perEmployeeChange = signed(Math.round((perEmployee('2025') / perEmployee('2023') - 1) * 100));
const outsourcingSince = signed(Math.round((outsourcingTotal('2025') / outsourcingTotal('2023') - 1) * 100));
const thousands = (value) => `$${Math.round(value / 1000)}K`;
await writeJson('data/index/outsourcing.json', {
	asOf: outsourcingLatest,
	stats: [
		{ label: `Combined revenue, ${outsourcingLatest}`, value: `$${Math.round(outsourcingTotal(outsourcingLatest) / 1e9)}B` },
		{ label: 'Year over year', value: signed(outsourcingChange) },
		{ label: 'Employees, 2025', value: employeesIn('2025') },
		{ label: 'Revenue per employee, 2025', value: thousands(perEmployee('2025')) },
	],
	findings: [`From 2023 to 2025, combined revenue moved ${outsourcingSince}, employees ${employeeChange}, and revenue per employee ${perEmployeeChange}.`],
	tables: [
		{
			title: 'Revenue and employees by company, 2025',
			columns: ['Company', 'Revenue', 'Employees'],
			rows: outsourcers.map((name) => [name, `$${(outsourcing[name]['2025'] / 1e9).toFixed(1)}B`, headcount[name]['2025']]),
		},
	],
});
{
	const path = 'src/content/sources/outsourcing.json';
	await writeJson(path, { ...(await readJson(path)), checked: outsourcingLatest });
}
await updateSignal('outsourcing', {
	value: `$${Math.round(outsourcingTotal(outsourcingLatest) / 1e9)}B`,
	change: signed(outsourcingChange),
	trend: series(outsourcingYears, outsourcingTrend),
	recent: outsourcingTrend.slice(-5).map((value, i, list) => Math.round((value / list[0]) * 1000) / 10),
	...reading(outsourcingChange, { up: 'Still growing', down: 'Shrinking' }, 'away'),
	rule: 'Still growing when combined revenue is higher than the year before.',
	fromHigh: fromHighOf(outsourcingTrend),
	analysis: {
		title: 'Revenue per employee',
		intro: `These firms charge for people, so this shows whether revenue is separating from headcount. From 2023 to 2025, it moved ${perEmployeeChange}.`,
		points: [
			`Revenue per employee went from ${thousands(perEmployee('2023'))} to ${thousands(perEmployee('2025'))}.`,
			`Revenue moved ${outsourcingSince} and employees ${employeeChange} over the same period.`,
			...outsourcers.map((name) => `${name}: $${(outsourcing[name]['2025'] / 1e9).toFixed(1)}B and ${number(headcount[name]['2025'])} employees in 2025.`),
		],
	},
});

// The solved score: how far each signal has moved since ChatGPT launched, from 0 to 100.
const BASELINE = '2022-11';
const clamp = (value) => Math.min(100, Math.max(0, value));
// Every goal is a judgment, so the published range moves them all together on their log scales.
let goalDistance = 1;
const toGoal = (value) => clamp(value / goalDistance);
// The latest reading at or before a month, within a limit so stale data stops counting.
// The current month is still partial, so it never counts as a reading.
const readingAt = (series, month, maxAge = 12) => {
	const known = Object.keys(series).filter((key) => key <= month && key < today.slice(0, 7) && key > nextMonth(month, -maxAge)).sort();
	return known.length > 0 ? series[known.at(-1)] : undefined;
};
const baselineOf = (series) => series[Object.keys(series).sort().find((key) => key >= BASELINE)];
// Reaching a tenth of the baseline scores 100 on a log scale, and rising scores 0.
const fallSince = (series, month, tenfold = 100) => {
	const value = readingAt(series, month);
	return value === undefined ? undefined : toGoal(-Math.log10(value / baselineOf(series)) * tenfold);
};
const growthSince = (series, month) => {
	const value = readingAt(series, month);
	return value === undefined ? undefined : toGoal(Math.log10(value / baselineOf(series)) * 100);
};

const fromQuarters = (keys, value) => Object.fromEntries(keys.map((quarter) => [`${quarter.slice(0, 4)}-${String(Number(quarter.slice(-1)) * 3).padStart(2, '0')}`, value(quarter)]));
const monthEnd = (month) => dayOf(`${nextMonth(month)}-01`) - DAY;
const scoreMonths = [];
for (let month = '2023-01'; month <= today.slice(0, 7); month = nextMonth(month)) scoreMonths.push(month);

// Software postings against all US postings, so the wider job market doesn't count.
const firstOfMonth = (rows) => Object.fromEntries(rows.filter(({ date }) => date.endsWith('-01')).map(({ date, index }) => [date.slice(0, 7), index]));
const softwareMonths = firstOfMonth(us.rows);
const allMonths = firstOfMonth(allUsRows);
softwareMonths[us.latest.date.slice(0, 7)] = us.latest.index;
const jobsGapAt = (month) => {
	const software = readingAt(softwareMonths, month, 2);
	const all = readingAt(allMonths, month, 2);
	return software === undefined || all === undefined ? undefined : clamp((1 - software / all / (softwareMonths[BASELINE] / allMonths[BASELINE])) * 100);
};
// The longest task any released model completes half the time, up to one working year of 2,000 hours.
const metrBestAt = (month) => {
	const released = metrResults.filter(({ released }) => released.slice(0, 7) <= month);
	return released.length > 0 ? Math.max(...released.map(({ estimate }) => estimate)) : undefined;
};
const metrLevelAt = (month) => toGoal((Math.log(Math.max(metrBestAt(month), 1)) / Math.log(2000 * 60)) * 100);
const stanceAt = (month) => {
	const months = stanceMonths.filter((candidate) => candidate <= month).slice(-12);
	if (months.length < 12) return undefined;
	const labels = stanceSample.filter((item) => months.includes(item.month)).map(({ id }) => stanceLabels[id]);
	const solved = labels.filter((label) => label === 'solved').length;
	const hackerNews = percent(solved, solved + labels.filter((label) => label === 'not_solved').length);
	const bluesky = blueskyMonths.filter((candidate) => candidate <= month).slice(-12);
	return bluesky.length === 12 ? (hackerNews + blueskyShare(bluesky).share) / 2 : hackerNews;
};
const kevRolling = Object.fromEntries(
	scoreMonths.filter((month) => monthEnd(month) - 365 * DAY >= dayOf('2023-01-01') && monthEnd(month) <= kevAsOf).map((month) => [month, addedIn(monthEnd(month) - 365 * DAY, monthEnd(month))]),
);
const outageRolling = Object.fromEntries(scoreMonths.filter((month) => month >= '2024-12' && month <= statusAsOf).map((month) => [month, majorRolling(month)]));
const pushesByMonth = fromQuarters(quarters, (quarter) => pushes[quarter]);
const revenueByMonth = fromQuarters(sharedQuarters, (quarter) => quarterlyTotals[sharedQuarters.indexOf(quarter)]);
const pricesByMonth = Object.fromEntries(priceRows.map(({ month, index }) => [month, index]));
const tokenByMonth = Object.fromEntries(pricedMonths.map((month) => [month, tokenPriceAt(month)]));
// A log bar fills slowly at first, so each growth signal says what its bar means.
const LOG_GOAL = 'The goal is 1,000 times. The bar is logarithmic, so 32 times fills half of it.';
const signedMove = (ratio) => `${ratio >= 1 ? 'Up' : 'Down'} ${Math.abs(Math.round((ratio - 1) * 100))}% since ChatGPT launched.`;
const movedSince = (series, month) => signedMove(readingAt(series, month) / baselineOf(series));
const firstMonth = (series) => Object.keys(series).sort()[0];
const sinceFirst = (series, month) => {
	const first = firstMonth(series);
	const word = first > BASELINE ? `since ${monthName(first)}, when the data starts` : 'since ChatGPT launched';
	const ratio = readingAt(series, month) / baselineOf(series);
	return `${ratio >= 1 ? 'Up' : 'Down'} ${Math.abs(Math.round((ratio - 1) * 100))}% ${word}.`;
};

// Fair comparisons: prices after inflation, money against the economy, failures against code pushed.
const divideSeries = (series, divisor, maxAge = 6) =>
	Object.fromEntries(
		Object.keys(series).flatMap((month) => {
			const by = readingAt(divisor, month, maxAge);
			return by ? [[month, series[month] / by]] : [];
		}),
	);
const pricesReal = divideSeries(pricesByMonth, economy.consumerPrices, 3);
const spendingShare = divideSeries(economy.softwareInvestment, economy.realGdp);
const revenueShare = Object.fromEntries(
	sharedQuarters.slice(3).flatMap((quarter, i) => {
		const window = sharedQuarters.slice(i, i + 4);
		const gdp = window.map((key) => economy.gdp[nextMonth(`${key.slice(0, 4)}-${String(Number(key.slice(-1)) * 3).padStart(2, '0')}`, -2)]);
		if (gdp.some((value) => !value)) return [];
		const revenue = window.reduce((sum, key) => sum + quarterlyTotals[sharedQuarters.indexOf(key)], 0);
		return [[`${quarter.slice(0, 4)}-${String(Number(quarter.slice(-1)) * 3).padStart(2, '0')}`, revenue / gdp.reduce((sum, value) => sum + value, 0)]];
	}),
);
const outsourcingReal = divideSeries(outsourcingByMonth, economy.consumerPrices, 3);
const developersByMonth = fromQuarters(quarters, (quarter) => developers[quarter]);
// Failures are scored per git push. Raw counts and failures per developer sit beside them as cross-checks,
// because AI agents can make pushes grow without making software any more reliable.
const FAILURES = Object.fromEntries(
	Object.entries({ security: kevRolling, bugs: bugByMonth, outages: outageRolling }).map(([id, raw]) => [
		id,
		{ raw, perPush: divideSeries(raw, pushesByMonth), perDeveloper: divideSeries(raw, developersByMonth) },
	]),
);
let pushAdjusted = true;
const failuresScored = (id) => (pushAdjusted ? FAILURES[id].perPush : FAILURES[id].raw);

// Each area asks one question and counts equally, so a busy area can't outvote a quiet one.
const SCORE_AREAS = [
	{
		name: 'Can AI do the work?',
		signals: [
			{ id: 'coding-benchmarks', at: (month) => (month >= sweFirst ? readingAt(sweByMonth, month, 24) : undefined), reason: () => `The best model resolves ${swePercent}% of SWE-bench Verified tasks.` },
			{ id: 'task-length', name: 'AI task length', source: 'metr', question: 'How long a task can AI complete?', metric: 'Human working hours of tasks completed with 50% success', solvedIf: 'AI completes tasks lasting a working year (2,000 hours)', value: () => `${hours(metrBest.estimate)} hours`, at: metrLevelAt, reason: () => `Best model: tasks of about ${hours(metrBest.estimate)} hours half the time, against a goal of a working year.` },
			{ id: 'token-prices', at: (month) => fallSince(tokenByMonth, month, 50), reason: (month) => sinceFirst(tokenByMonth, month) },
			{ id: 'task-cost', name: 'Cost of a hard task', source: 'epoch-benchmarks', question: 'How much does a hard coding task cost?', metric: 'AI usage cost per FrontierSWE task for a near-top score', solvedIf: 'A hard coding task costs $1 in AI usage', value: (month) => usd(taskCostRunAt(month).cost), at: taskCostAt, reason: (month) => `About ${usd(taskCostRunAt(month).cost)} of AI usage per FrontierSWE task for a near-top score, against a goal of $1.` },
		],
	},
	{
		name: 'Is it being used to build?',
		note: 'This measures use, not whether the software works. Pushes and tokens can also grow through retries, longer reasoning or automation, so growth here is the weakest kind of evidence in the score.',
		signals: [
			{ id: 'code-activity', at: (month) => growthSince(pushesByMonth, month), reason: (month) => movedSince(pushesByMonth, month) },
			{ id: 'agent-prs', at: (month) => readingAt(agentShare, month, 3) ?? 0, reason: () => `${oneDecimal(agentShareAt(agentLatest))}% of public pull requests clearly come from agents, and most agent work is hidden.` },
			{ id: 'no-code-revenue', at: (month) => growthSince(noCodeByMonth, month), reason: (month) => movedSince(noCodeByMonth, month) },
			{ id: 'programming-share', at: (month) => readingAt(shareByMonth, month, 3), reason: () => `About ${Math.round(shareOf(shareLatest))}% of OpenRouter tokens are programming.` },
			{ id: 'coding-agents', at: (month) => {
				const value = readingAt(codingByMonth, month, 3);
				return value === undefined ? undefined : toGoal((Math.log10(value / codingTotal(codingMonths[0])) / 3) * 100);
			}, reason: () => `${codingGrowth} times the tokens of ${monthName(codingMonths[0])}. ${LOG_GOAL}` },
			{ id: 'new-businesses', at: (month) => growthSince(applications, month), reason: (month) => movedSince(applications, month) },
			{ id: 'token-usage', at: (month) => {
				const value = readingAt(routerByMonth, month, 3);
				return value === undefined ? undefined : toGoal((Math.log10(value / routerTotal(routerMonths[0])) / 3) * 100);
			}, reason: () => `${routerGrowth} times the tokens of ${monthName(routerMonths[0])}. ${LOG_GOAL}` },
			{ id: 'ai-built-sites', weight: 0.25, at: (month) => {
				const value = readingAt(builderByMonth, month, 3);
				return value === undefined ? undefined : toGoal((Math.log10(value / builderTrend[0]) / 3) * 100);
			}, reason: (month) => `${(readingAt(builderByMonth, month, 3) / builderTrend[0]).toFixed(1)} times the sites of ${monthName(builderStart)}. ${LOG_GOAL} Counts a quarter as much as other signals here.` },
		],
	},
	{
		name: 'Are fewer people needed?',
		signals: [
			{ id: 'jobs', at: jobsGapAt, reason: (month) => `Software postings have lost ${Math.round(jobsGapAt(month))}% against all US postings since ChatGPT launched.` },
			{ id: 'ai-company-jobs', at: () => percent(aiJobsRows.length - aiJobsHiring.length, aiJobsRows.length), reason: () => `${aiJobsRows.length - aiJobsHiring.length} of ${aiJobsRows.length} AI companies have stopped hiring engineers.` },
			{ id: 'outsourcing', at: (month) => fallSince(outsourcingReal, month), reason: (month) => `After inflation: ${sinceFirst(outsourcingReal, month)}` },
			{ id: 'tech-hiring', at: (month) => fallSince(openingsByMonth, month), reason: (month) => movedSince(openingsByMonth, month) },
			{ id: 'stack-overflow', at: (month) => fallSince(soMonths, month), reason: (month) => `${movedSince(soMonths, month)} Falling to a tenth scores 100%.` },
			{ id: 'tech-output', at: (month) => {
				const value = readingAt(perWorker, month, 12);
				if (value === undefined) return undefined;
				const key = Object.keys(perWorker).filter((candidate) => candidate <= month).sort().at(-1);
				return toGoal(100 * Math.log2(aboveTrend(key)));
			}, reason: () => `Output per worker is ${signed(techAbove)} against its 2015 to 2019 trend. Doubling that trend scores 100%.` },
			{ id: 'sentiment', at: stanceAt, reason: () => `${combinedShare}% of sampled Hacker News and Bluesky posts taking a side say it is getting solved.` },
		],
	},
	{
		name: 'Is software cheaper and more reliable?',
		note: 'Money is compared with the economy and inflation, and failures with how much code is pushed. A rise scores 0%, which means no sign of change yet. AI agents may be inflating the number of pushes, which would make failures look rarer than they are, so each failure signal shows what it would score without that adjustment.',
		signals: [
			{ id: 'revenue', at: (month) => fallSince(revenueShare, month), reason: (month) => `Against GDP: ${sinceFirst(revenueShare, month)}` },
			{ id: 'prices', at: (month) => fallSince(pricesReal, month), reason: (month) => `After inflation: ${sinceFirst(pricesReal, month)}` },
			{ id: 'security', at: (month) => fallSince(failuresScored('security'), month), reason: (month) => `Per git push: ${sinceFirst(FAILURES.security.perPush, month)}` },
			{ id: 'bugs', at: (month) => fallSince(failuresScored('bugs'), month), reason: (month) => `Per git push: ${sinceFirst(FAILURES.bugs.perPush, month)}` },
			{ id: 'software-spending', at: (month) => fallSince(spendingShare, month), reason: (month) => `Against real GDP: ${sinceFirst(spendingShare, month)}` },
			{ id: 'outages', at: (month) => fallSince(failuresScored('outages'), month), reason: (month) => `Per git push: ${sinceFirst(FAILURES.outages.perPush, month)}` },
		],
	},
];
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const areaScoresAt = (month) =>
	SCORE_AREAS.map(({ signals }) => {
		const readings = signals.flatMap(({ at, weight = 1 }) => {
			const value = at(month);
			return value === undefined ? [] : [{ value, weight }];
		});
		const totalWeight = readings.reduce((sum, { weight }) => sum + weight, 0);
		return readings.length > 0 ? readings.reduce((sum, { value, weight }) => sum + value * weight, 0) / totalWeight : 0;
	});
const scoreAt = (month) => Math.round(average(areaScoresAt(month)));
const currentMonth = today.slice(0, 7);
const solvedScore = scoreAt(currentMonth);
const scoreWithGoals = (distance) => {
	goalDistance = distance;
	const score = scoreAt(currentMonth);
	goalDistance = 1;
	return score;
};
const scoreWithoutPushAdjustment = () => {
	pushAdjusted = false;
	const score = scoreAt(currentMonth);
	pushAdjusted = true;
	return score;
};
const scoreByMonth = scoreMonths.map((month) => ({ date: month, score: scoreAt(month) }));
const scoreAreas = await Promise.all(SCORE_AREAS.map(async ({ name, note, signals }, i) => {
	const rows = await Promise.all(signals.map(async ({ id, name: signalName, source, at, reason, weight = 1, question, metric, solvedIf, value }) => {
		const score = Math.round(at(currentMonth) ?? 0);
		const why = reason(currentMonth);
		const signal = signalName
			? { order: 100 + i, group: 'Capability', name: signalName, question, metric, solvedIf, value: value(currentMonth), score, scoreReason: why }
			: await updateSignal(id, { score, scoreReason: why });
		if (signalName) await writeJson(`src/content/signals/${id}.json`, signal);
		return { id, weight, source, href: `/signals/${id}`, name: signal.name, score, reason: why };
	}));
	rows.sort((a, b) => b.score - a.score);
	return { name, note, score: Math.round(areaScoresAt(currentMonth)[i]), signals: rows };
}));
// Each failure signal shows its count against what the score uses, and what it would score without the push adjustment.
const startOf = (series) => (firstMonth(series) > BASELINE ? monthName(firstMonth(series)) : 'ChatGPT launched');
const moveSince = (series) => {
	const ratio = readingAt(series, currentMonth) / baselineOf(series);
	return `${ratio >= 1 ? 'up' : 'down'} ${Math.abs(Math.round((ratio - 1) * 100))}%`;
};
const baselineMonth = (series) => Object.keys(series).sort().find((key) => key >= BASELINE);
const perPushLine = (perPush, labels) =>
	labels.flatMap((label) => {
		const value = perPush[label.slice(0, 7)];
		return value === undefined ? [] : [{ label, value: Math.round((value / baselineOf(perPush)) * 1000) / 10 }];
	});
const scoreWithout = (raw, perPush) => {
	const [rawScore, adjusted] = [raw, perPush].map((series) => Math.round(fallSince(series, currentMonth) ?? 0));
	return rawScore === adjusted ? `This signal scores ${adjusted}% with or without the git push adjustment.` : `Without the git push adjustment, this signal would score ${rawScore}% instead of ${adjusted}%.`;
};
const noAdjustment = scoreWithoutPushAdjustment();
for (const [id, labels] of [
	['security', securityDates],
	['bugs', bugMonths],
	['outages', outageTrend.map((_, i) => nextMonth('2024-12', i))],
]) {
	const { raw, perPush, perDeveloper } = FAILURES[id];
	const kept = ((await readJson(`src/content/signals/${id}.json`)).caution ?? []).filter((line) => !line.includes('git push'));
	await updateSignal(id, {
		comparison: { name: `Per git push (${monthName(baselineMonth(perPush))} = 100)`, trend: perPushLine(perPush, labels) },
		caution: [
			...kept,
			`Since ${startOf(raw)}: the count is ${moveSince(raw)}, ${moveSince(perPush)} per git push (what the score uses) and ${moveSince(perDeveloper)} per developer. If AI agents make pushes grow without making software more reliable, the per-push reading flatters this signal.`,
			scoreWithout(raw, perPush),
		],
	});
}
// A high average can hide a weak question, so "Solved." also needs every question above a floor.
const SOLVED_AT = 90;
const SOLVED_EVERY_QUESTION_AT = 75;
const weakestQuestion = Math.min(...scoreAreas.map(({ score }) => score));
const VERDICTS = [
	[SOLVED_AT, 'Solved.'],
	[75, 'Almost.'],
	[50, 'Getting there.'],
	[0, 'Not yet.'],
];

const SCORE_HISTORY = 'data/score-history.json';
const scoreHistory = await readFile(SCORE_HISTORY, 'utf8').then(JSON.parse).catch(() => ({}));
scoreHistory[today] = solvedScore;
await writeJson(SCORE_HISTORY, scoreHistory);
await writeJson('data/score.json', {
	score: solvedScore,
	verdict: solvedScore >= SOLVED_AT && weakestQuestion < SOLVED_EVERY_QUESTION_AT ? 'Almost.' : VERDICTS.find(([floor]) => solvedScore >= floor)[1],
	scoreRange: { low: scoreWithGoals(1.25), high: scoreWithGoals(0.8) },
	withoutPushAdjustment: noAdjustment,
	weakestQuestion,
	areas: scoreAreas,
	history: scoreByMonth,
	checks: Object.entries(scoreHistory).map(([date, score]) => ({ date, score })),
});
console.log(`Solved score: ${solvedScore}`);

// Every run saves each signal's reading under the date it was checked.
const CHECKS = 'data/signal-checks.json';
const checks = await readFile(CHECKS, 'utf8').then(JSON.parse).catch(() => ({}));
checks[today] = {};
for (const file of (await readdir('src/content/signals')).sort()) {
	const { value, change, status } = await readJson(`src/content/signals/${file}`);
	if (value !== undefined) checks[today][file.replace('.json', '')] = { value, change, status };
}
await writeJson(CHECKS, checks);

// One place listing the credit every source requires.
const attributions = await Promise.all(
	(await readdir('src/content/sources')).sort().map((file) => readJson(`src/content/sources/${file}`)),
);
await writeFile(
	'data/ATTRIBUTION.md',
	[
		'# Data attribution',
		'',
		'Generated by `npm run index`. Only processed counts and analysis are published.',
		'',
		...attributions.map(({ name, url, license, licenseUrl, attribution }) =>
			`- **[${name}](${url})**: ${attribution} License: [${license}](${licenseUrl}).`,
		),
		'',
	].join('\n'),
);
