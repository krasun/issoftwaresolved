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
	chart?: { name: string; labels: string[]; values: number[] };
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

export const signalRecord = ({ id, data }: Awaited<ReturnType<typeof getSignals>>[number]) => ({
	id,
	name: data.name,
	question: data.question,
	metric: data.metric,
	solvedIf: data.solvedIf,
	value: data.value,
	change: data.change,
	trend: data.trend,
	trendDates: data.trendDates,
	trendLabel: data.trendLabel,
	trendStart: data.trendStart,
	trendStep: data.trendStep,
	caution: data.caution,
	prompt: data.prompt,
	score: data.score,
	scoreReason: data.scoreReason,
	comparison: data.comparison,
	events: data.events,
	analysis: data.analysis,
	fromHigh: data.fromHigh,
	status: data.status,
	rule: data.rule,
	direction: data.direction,
	checks: getSignalChecks(id),
	url: `/signals/${id}`,
	api: `/api/signals/${id}.json`,
});

// Sources are only credited here. Their data stays with them.
export const creditRecord = ({ data }: Awaited<ReturnType<typeof getSources>>[number]) => ({
	name: data.name,
	url: data.url,
	signal: data.signal.id,
	license: data.license,
	credit: data.attribution,
});

export const API_NOTICE =
	'Please credit "Is software solved?" and the sources listed in credits when you reuse these numbers. They are our own aggregates. For original records, go to each source.';

export const json = (data: unknown) =>
	new Response(JSON.stringify(data, null, 2), {
		headers: { 'content-type': 'application/json; charset=utf-8' },
	});

export const areaAnchor = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
export const signalArea = (id: string) => site.areas?.find(area => area.signals.some(signal => signal.href === `/signals/${id}`));
