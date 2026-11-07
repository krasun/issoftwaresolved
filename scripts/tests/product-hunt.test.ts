import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeMonths, monthStart, parseProductHunt } from '../sources/product-hunt.ts';

test('Product Hunt months start at Pacific midnight, including the day daylight saving ends', () => {
	assert.equal(monthStart('2026-01'), '2026-01-01T00:00:00-08:00');
	assert.equal(monthStart('2026-07'), '2026-07-01T00:00:00-07:00');
	assert.equal(monthStart('2026-11'), '2026-11-01T00:00:00-07:00');
});
test('Product Hunt leaves out the current Pacific month', () => {
	const months = completeMonths(new Date('2026-11-01T06:00:00Z'));
	assert.equal(months[0], '2013-11');
	assert.equal(months.at(-1), '2026-09');
	assert.equal(completeMonths(new Date('2026-11-01T08:00:00Z')).at(-1), '2026-10');
	assert.equal(completeMonths(new Date('2026-12-01T09:00:00Z')).at(-1), '2026-11');
});
test('Product Hunt keeps both counts per month', () => {
	const data = { all0: { totalCount: 30 }, featured0: { totalCount: 2 }, all1: { totalCount: 40 }, featured1: { totalCount: 0 } };
	assert.deepEqual(parseProductHunt(['2026-09', '2026-10'], { data }), [
		{ month: '2026-09', launched: 30, featured: 2 },
		{ month: '2026-10', launched: 40, featured: 0 },
	]);
});
test('Product Hunt rejects errors, missing counts and more featured than launched', () => {
	for (const bad of [
		{ errors: [{ message: 'rate limited' }] },
		{ data: { all0: { totalCount: 3 } } },
		{ data: { all0: null, featured0: { totalCount: 1 } } },
		{ data: { all0: { totalCount: 1 }, featured0: { totalCount: 2 } } },
		{ data: { all0: { totalCount: -1 }, featured0: { totalCount: -1 } } },
	]) assert.throws(() => parseProductHunt(['2026-10'], bad));
});
