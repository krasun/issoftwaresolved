import type { APIRoute } from 'astro';
import { API_NOTICE, creditRecord, getSignals, getSources, json, signalRecord } from '../../../lib/content';

export const getStaticPaths = async () =>
	(await getSignals()).map((signal) => ({ params: { id: signal.id }, props: { signal } }));

type Props = { signal: Awaited<ReturnType<typeof getSignals>>[number] };

export const GET: APIRoute<Props> = async ({ props: { signal } }) =>
	json({
		notice: API_NOTICE,
		...signalRecord(signal),
		credits: (await getSources()).filter((source) => source.data.signal.id === signal.id).map(creditRecord),
	});
