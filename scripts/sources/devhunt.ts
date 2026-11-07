import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.ts';

const API = 'https://devhunt.org/api/open-data/v1';

export interface DevHuntMonth {
	month: string;
	submitted: number;
	launched: number;
	paid: number;
	githubRepo: number;
	notDevTool: number;
	removed: number;
}
export interface DevHuntCategoryMonth {
	month: string;
	submitted: number;
	counts: Record<string, number>;
}
export interface DevHuntChange {
	date: string;
	kind: string;
	summary: string;
}
export interface DevHunt {
	generatedAt: string;
	tools: DevHuntMonth[];
	categories: DevHuntCategoryMonth[];
	changes: DevHuntChange[];
}

const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const isMonth = (value: unknown) => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const rowsOf = (response: unknown, name: string) => {
	const { license, data } = (response ?? {}) as { license?: unknown; data?: unknown };
	// The data is only ours to keep under this license, so a change has to be read before it is used.
	if (license !== 'CC-BY-4.0') throw new Error(`DevHunt ${name}: license is ${String(license)}, not CC-BY-4.0`);
	if (!Array.isArray(data) || !data.length) throw new Error(`DevHunt ${name}: missing data`);
	return data as Record<string, unknown>[];
};
const checkMonths = (rows: Record<string, unknown>[], name: string) => {
	const months = rows.map(({ month }) => month);
	if (!months.every(isMonth) || new Set(months).size !== months.length) throw new Error(`DevHunt ${name}: invalid or repeated months`);
	if (rows.some(({ complete }) => complete !== true)) throw new Error(`DevHunt ${name}: partial month`);
};

// Validate before replacing the cache: complete months only, and both endpoints must agree.
export function parseDevHunt({ tools, categories, changes }: { tools: unknown; categories: unknown; changes: unknown }): DevHunt {
	const toolRows = rowsOf(tools, 'tools-per-month');
	checkMonths(toolRows, 'tools-per-month');
	const fields = ['submitted', 'launched', 'paid', 'githubRepo', 'notDevTool', 'removed'] as const;
	if (toolRows.some((row) => !fields.every((field) => count(row[field])))) throw new Error('DevHunt tools-per-month: invalid counts');

	const categoryRows = rowsOf(categories, 'categories-per-month');
	checkMonths(categoryRows, 'categories-per-month');
	const names = (categories as { categoryNames?: unknown }).categoryNames;
	if (!Array.isArray(names) || !names.length || !names.every((name) => typeof name === 'string')) throw new Error('DevHunt categories-per-month: missing category names');
	const submittedIn = new Map(toolRows.map(({ month, submitted }) => [month, submitted]));
	for (const row of categoryRows) {
		const counts = row.counts as Record<string, unknown> | undefined;
		if (!counts || !names.every((name) => count(counts[name]) && (counts[name] as number) <= (row.submitted as number))) throw new Error(`DevHunt categories-per-month: invalid counts in ${row.month}`);
		if (submittedIn.get(row.month) !== row.submitted) throw new Error(`DevHunt: endpoints disagree on ${row.month}`);
	}
	if (categoryRows.length !== toolRows.length) throw new Error('DevHunt: endpoints cover different months');

	const changeRows = rowsOf(changes, 'changes');
	if (changeRows.some(({ date, kind, summary }) => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof kind !== 'string' || typeof summary !== 'string')) {
		throw new Error('DevHunt changes: invalid entries');
	}

	const generatedAt = (tools as { generatedAt?: unknown }).generatedAt;
	if (typeof generatedAt !== 'string') throw new Error('DevHunt tools-per-month: missing generatedAt');
	const byMonth = <T extends { month: string }>(rows: T[]) => rows.sort((a, b) => a.month.localeCompare(b.month));
	return {
		generatedAt,
		tools: byMonth(toolRows.map((row) => ({ month: row.month as string, ...Object.fromEntries(fields.map((field) => [field, row[field] as number])) }) as DevHuntMonth)),
		categories: byMonth(categoryRows.map((row) => ({
			month: row.month as string,
			submitted: row.submitted as number,
			counts: Object.fromEntries((names as string[]).map((name) => [name, (row.counts as Record<string, number>)[name]])),
		}))),
		changes: changeRows.map(({ date, kind, summary }) => ({ date: date as string, kind: kind as string, summary: summary as string })).sort((a, b) => a.date.localeCompare(b.date)),
	};
}

export const fetchDevHunt = async () => {
	const [tools, categories, changes] = await Promise.all(
		['tools-per-month?complete=true', 'categories-per-month?complete=true', 'changes'].map(async (path) => (await request(`${API}/${path}`)).json()),
	);
	const data = parseDevHunt({ tools, categories, changes });
	await mkdir('data/raw/devhunt', { recursive: true });
	await writeFile('data/raw/devhunt/open-data.json', `${JSON.stringify(data, null, '\t')}\n`);
	console.log(`DevHunt: ${data.tools.length} months, ${data.changes.length} changes`);
};
