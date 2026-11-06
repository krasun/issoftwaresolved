import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

// The tracker on layoffs.fyi is a public Airtable view. Its page carries a signed link to the view's data.
const EMBED = 'https://airtable.com/embed/app1PaujS9zxVGUZ4/shroKsHx3SdYYOzeh';
const LARGEST = 10;
// The tracker only grows, and had 4,659 layoffs in November 2026. Far fewer means a broken read.
const MIN_ROWS = 4000;
// Layoffs are added every week, so a newest layoff older than this means stale data.
const MAX_AGE_DAYS = 45;
const COLUMNS = { Company: 'text', Date: 'date', '# Laid Off': 'number', AI: 'select' };

interface Column {
	id: string;
	name: string;
	type: string;
	typeOptions?: { choices?: Record<string, { name: string }> };
}
interface Table {
	columns: Column[];
	rows: { id: string; cellValuesByColumnId: Record<string, unknown> }[];
}
interface Totals {
	events: number;
	laidOff: number;
	unknown: number;
	aiEvents: number;
	aiLaidOff: number;
	untagged: number;
}

// Fails on anything unexpected, so a changed page never replaces good data with partial data.
const fail: (message: string) => never = (message) => {
	throw new Error(`layoffs: ${message}`);
};

// Only monthly counts and the largest recent cuts are kept, never sources or notes.
export const fetchLayoffs = async () => {
	const page = await request(EMBED);
	const html = await page.text();
	const link = html.match(/urlWithParams: *"([^"]+)"/)?.[1] ?? fail('no data link on the tracker page');
	const application = html.match(/"x-airtable-application-id":"([^"]+)"/)?.[1] ?? fail('no application id on the tracker page');
	const cookie = page.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
	const response = await fetch(`https://airtable.com${JSON.parse(`"${link}"`)}`, {
		headers: { cookie, 'x-airtable-application-id': application, 'x-requested-with': 'XMLHttpRequest', 'x-time-zone': 'UTC', 'x-user-locale': 'en' },
	});
	if (!response.ok) fail(`HTTP ${response.status}`);
	const body = (await response.json()) as { msg?: string; data?: { table?: Table } };
	if (body.msg !== 'SUCCESS' || !Array.isArray(body.data?.table?.rows)) fail(`unexpected response: ${body.msg}`);
	const { table } = body.data;
	if (table.rows.length < MIN_ROWS) fail(`only ${table.rows.length} layoffs, expected at least ${MIN_ROWS}`);

	const column = Object.fromEntries(table.columns.map((item) => [item.name, item]));
	for (const [name, type] of Object.entries(COLUMNS)) {
		if (column[name]?.type !== type) fail(`column "${name}" is ${column[name]?.type ?? 'missing'}, expected ${type}`);
	}
	const id = (name: string) => column[name].id;
	const labels = Object.fromEntries(Object.entries(column.AI.typeOptions?.choices ?? {}).map(([key, { name }]) => [key, name]));
	if (!['Yes', 'No'].every((name) => Object.values(labels).includes(name))) fail(`AI labels are ${Object.values(labels).join(', ') || 'missing'}, expected Yes and No`);

	const months: Record<string, Totals> = {};
	const events: { company: string; month: string; laidOff: number; ai: boolean }[] = [];
	for (const { id: row, cellValuesByColumnId: cells } of table.rows) {
		const company = cells[id('Company')];
		const date = cells[id('Date')];
		const laidOff = cells[id('# Laid Off')];
		const tag = cells[id('AI')] as string | null | undefined;
		if (typeof company !== 'string' || !company.trim()) fail(`row ${row} has no company`);
		if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(date)) fail(`row ${row} has date ${JSON.stringify(date)}`);
		if (laidOff !== undefined && laidOff !== null && !(Number.isInteger(laidOff) && (laidOff as number) >= 0)) fail(`row ${row} has ${JSON.stringify(laidOff)} laid off`);
		if (tag !== undefined && tag !== null && !labels[tag]) fail(`row ${row} has an unknown AI label`);
		const month = date.slice(0, 7);
		const counted = typeof laidOff === 'number';
		const ai = labels[tag as string];
		const totals = (months[month] ??= { events: 0, laidOff: 0, unknown: 0, aiEvents: 0, aiLaidOff: 0, untagged: 0 });
		totals.events += 1;
		if (counted) totals.laidOff += laidOff;
		else totals.unknown += 1;
		if (ai === 'Yes') {
			totals.aiEvents += 1;
			if (counted) totals.aiLaidOff += laidOff;
		} else if (ai !== 'No') totals.untagged += 1;
		if (counted) events.push({ company: company.trim(), month, laidOff, ai: ai === 'Yes' });
	}

	const newest = table.rows.reduce((latest, { cellValuesByColumnId: cells }) => ((cells[id('Date')] as string) > latest ? (cells[id('Date')] as string) : latest), '');
	const age = (Date.now() - Date.parse(newest)) / 86_400_000;
	if (age > MAX_AGE_DAYS) fail(`newest layoff is from ${newest.slice(0, 10)}, ${Math.round(age)} days ago`);
	const recentAi = Object.entries(months).some(([month, { aiEvents }]) => month >= '2024' && aiEvents > 0);
	if (!recentAi) fail('no layoffs attributed to AI since 2024, so the AI labels were not read');

	const now = new Date().toISOString().slice(0, 7);
	const yearAgo = `${Number(now.slice(0, 4)) - 1}${now.slice(4)}`;
	const largest = events
		.filter(({ month }) => month >= yearAgo && month < now)
		.sort((a, b) => b.laidOff - a.laidOff)
		.slice(0, LARGEST);

	await mkdir('data/raw/layoffs', { recursive: true });
	await writeFile('data/raw/layoffs/monthly.json', `${JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), months, largest }, null, '\t')}\n`);
	console.log(`Layoffs: ${table.rows.length} layoffs in ${Object.keys(months).length} months`);
};
