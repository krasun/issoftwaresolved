import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
interface Point { label: string; value: number }
interface Signal { trend?: Point[]; comparison?: { trend: Point[] }; score?: number }
interface Score { score: number; scoreRange: { low: number; high: number }; areas: { signals: { id: string; href: string; score: number; weight: number }[] }[] }
const read = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const signals = new Map(readdirSync('src/content/signals').map(file => [file.replace('.json',''),read<Signal>(`src/content/signals/${file}`)]));
test('every chart observation has a label and a finite value', () => {
 for (const [id, signal] of signals) {
  if (!signal.trend) continue;
  assert.ok(signal.trend.every(({ label, value }) => typeof label === 'string' && label.length && Number.isFinite(value)),id);
  if (signal.comparison) assert.ok(signal.comparison.trend.every(({ label }) => signal.trend!.some(point => point.label === label)),id);
 }
});
test('all scored links resolve to matching signal scores and positive weights', () => {
 for (const area of read<Score>('data/score.json').areas) for (const row of area.signals) {
  const signal = signals.get(row.id);
  assert.ok(signal,row.id);
  assert.equal(row.href,`/signals/${row.id}`);
  assert.equal(row.score,signal.score,row.id);
  assert.ok(row.weight > 0,row.id);
 }
});
test('npm publishes its complete dated series', () => {
 const { trend } = read<{ chart: { trend: Point[] } }>('data/index/npm.json').chart;
 assert.ok(trend.length > 12);
 assert.ok(trend.every(({ label },i) => !i || label > trend[i-1].label));
});
test('the score sits inside its goal range and only scored signals carry a score', () => {
 const { score, scoreRange, areas } = read<Score>('data/score.json');
 assert.ok(scoreRange.low <= score && score <= scoreRange.high);
 const scored = new Set(areas.flatMap(area => area.signals.map(row => row.id)));
 for (const [id, signal] of signals) if (signal.score !== undefined) assert.ok(scored.has(id),id);
});
