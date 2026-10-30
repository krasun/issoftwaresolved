import { getCollection } from 'astro:content';
import { site } from '../content/site';

export const getSignals = async () =>
	(await getCollection('signals', ({ data }) => data.value !== undefined)).sort(
		(a, b) => a.data.order - b.data.order,
	);

export const getSources = () => getCollection('sources');

// A line needs at least two points.
export const scoreHistory = (site.history?.length ?? 0) >= 2 ? site.history : undefined;
