import { sources } from './sources/index.ts';

// `npm run fetch -- indeed bls` only refreshes those sources.
const selected = process.argv.slice(2);
const unknown = selected.filter((name) => !(name in sources));
if (unknown.length > 0) throw new Error(`Unknown sources: ${unknown.join(', ')}`);

// A failing source keeps its previous data and doesn't stop the others.
const names = selected.length > 0 ? selected : Object.keys(sources);
const results = await Promise.allSettled(names.map((name) => sources[name]()));
const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
for (const { reason } of failures) console.error(reason.message);
if (failures.length > 0) process.exitCode = 1;
