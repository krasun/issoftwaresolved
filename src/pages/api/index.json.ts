import { site } from '../../content/site';
import { API_NOTICE, creditRecord, getLastUpdated, getSignals, getSources, json, scoreHistory, signalRecord } from '../../lib/content';

export const GET = async () =>
	json({
		notice: API_NOTICE,
		verdict: site.score === undefined ? 'Undefined.' : site.verdict,
		score: site.score,
		questions: site.areas,
		history: scoreHistory,
		lastUpdated: await getLastUpdated(),
		signals: (await getSignals()).map(signalRecord),
		credits: (await getSources()).map(creditRecord),
	});
