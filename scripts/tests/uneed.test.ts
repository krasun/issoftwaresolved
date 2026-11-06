import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUneedMonths } from '../sources/uneed.ts';
const row = { month: '2026-10', complete: true, launched: 851, submitted: null, declined: null, estimated: false };
test('Uneed preserves unavailable counts and source completeness, sorted by month', () => {
 const rows = parseUneedMonths({ months: [{ ...row, month: '2026-11', complete: false, submitted: 0, declined: 0, estimated: true }, row] });
 assert.deepEqual(rows[0], row);
 assert.equal(rows[1].complete, false);
 assert.equal(rows[1].submitted, 0);
 assert.equal(rows[1].estimated, true);
});
test('Uneed rejects invalid or duplicate observations before overwriting its cache', () => {
 for (const months of [[], [row, row], [{ ...row, launched: -1 }], [{ ...row, submitted: undefined }], [{ ...row, month: '2026-13' }], [{ ...row, complete: undefined }]]) {
  assert.throws(() => parseUneedMonths({ months }));
 }
});
