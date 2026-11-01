import type { APIRoute } from 'astro';
import { site as index } from '../content/site';
import { getLastUpdated, getSignals, getSources } from '../lib/content';

export const GET: APIRoute = async ({ site }) => {
	const link = (path: string) => (site ? new URL(path, site).href : path);
	const signals = await getSignals();
	const sources = await getSources();
	const lastUpdated = await getLastUpdated();

	const lines = [
		'# Is software solved?',
		'',
		'> A public index that tracks whether software is finished, using public data on jobs, AI use, revenue, security, bugs and outages.',
		'',
		`Verdict: ${index.score === undefined ? 'Undefined.' : (index.verdict ?? 'Undefined.')}`,
		...(index.score === undefined ? [] : [`Solved score: ${index.score}%`]),
		...(lastUpdated ? [`Last updated: ${lastUpdated}`] : []),
		'',
		'Reusing these numbers? Please credit "Is software solved?" and the sources below.',
		'',
		'## API',
		`- [Everything](${link('/api/index.json')}): verdict, score, questions, history, signals and credits`,
		`- [Signals](${link('/api/signals.json')}): one file per signal at /api/signals/{id}.json`,
		`- [API docs](${link('/api')})`,
		'',
		'## Signals',
		...signals.map(
			({ id, data }) =>
				`- [${data.name}](${link(`/signals/${id}`)}): ${data.metric}: ${data.value}${data.change ? ` (${data.change} YoY)` : ''}${data.status ? `. ${data.status}` : ''}`,
		),
		'',
		'## Credits',
		...sources.map(
			({ id, data }) =>
				`- [${data.name}](${link(`/sources/${id}`)}): ${data.measures}${data.license ? `. License: ${data.license}` : ''}${data.attribution ? `. Credit: ${data.attribution}` : ''}`,
		),
		'',
		'## Pages',
		`- [Solved score](${link('/score')}): how the score is calculated\n- [How it works](${link('/how-it-works')})`,
		`- [About](${link('/about')})`,
		'',
	];
	return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
