import { getCollection } from 'astro:content';
import { site } from '../content/site';

export const getSignals = async () =>
	(await getCollection('signals', ({ data }) => data.value !== undefined)).sort(
		(a, b) => a.data.order - b.data.order,
	);

export const getSources = () => getCollection('sources');

// A line needs at least two points.
export const scoreHistory = (site.history?.length ?? 0) >= 2 ? site.history : undefined;

const analyses = import.meta.glob<{ default: Analysis }>('/data/index/*.json', { eager: true });

export type Analysis = {
	asOf: string;
	stats: { label: string; value: number | string }[];
	findings: string[];
	tables: { title: string; columns: string[]; rows: (number | string)[][] }[];
};

export const getAnalysis = (id: string) => analyses[`/data/index/${id}.json`]?.default;

const checks = import.meta.glob<{ default: Record<string, Record<string, SignalCheck>> }>('/data/signal-checks.json', {
	eager: true,
})['/data/signal-checks.json']?.default;

export type SignalCheck = { value: string; change?: string; status?: string };

// Newest first, one row per date the signal was checked.
export const getSignalChecks = (id: string) =>
	Object.entries(checks ?? {})
		.filter(([, signals]) => signals[id])
		.map(([date, signals]) => ({ date, ...signals[id] }))
		.sort((a, b) => b.date.localeCompare(a.date));

// The date a person set wins, otherwise the most recent refresh.
export const getLastUpdated = async () => {
	if (site.updated) return site.updated;
	const latest = Object.keys(checks ?? {}).sort().at(-1);
	return latest && new Date(`${latest}T00:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' });
};
