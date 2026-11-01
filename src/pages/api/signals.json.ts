import { API_NOTICE, creditRecord, getSignals, getSources, json, signalRecord } from '../../lib/content';

export const GET = async () =>
	json({
		notice: API_NOTICE,
		signals: (await getSignals()).map(signalRecord),
		credits: (await getSources()).map(creditRecord),
	});
