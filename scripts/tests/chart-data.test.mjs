import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const read = path => JSON.parse(readFileSync(path));
const signals = new Map(readdirSync('src/content/signals').map(file => [file.replace('.json',''),read(`src/content/signals/${file}`)]));
test('every chart observation has a label and a finite value', () => {
 for (const [id, signal] of signals) {
  if (!signal.trend) continue;
  assert.equal(signal.trendDates?.length,signal.trend.length,id);
  assert.ok(signal.trend.every(Number.isFinite),id);
  assert.ok(signal.trendDates.every(label => typeof label === 'string' && label.length),id);
 }
});
test('all scored links resolve to matching signal scores and positive weights', () => {
 for (const area of read('data/score.json').areas) for (const row of area.signals) {
  const signal = signals.get(row.id);
  assert.ok(signal,row.id);
  assert.equal(row.href,`/signals/${row.id}`);
  assert.equal(row.score,signal.score,row.id);
  assert.ok(row.weight > 0,row.id);
 }
});
test('npm publishes its complete dated series', () => {
 const { chart } = read('data/index/npm.json');
 assert.ok(chart.values.length > 12);
 assert.equal(chart.values.length,chart.labels.length);
 assert.ok(chart.labels.every((label,i) => !i || label > chart.labels[i-1]));
});
