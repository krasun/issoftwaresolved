import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDevHunt } from '../sources/devhunt.ts';
const tool = { month: '2026-10', complete: true, submitted: 3, launched: 1, paid: 1, githubRepo: 0, notDevTool: 0, removed: 0 };
const category = { month: '2026-10', complete: true, submitted: 3, counts: { MCP: 2, 'AI Coding': 0 } as Record<string, number> };
const change = { date: '2026-09-27', kind: 'submit-flow', summary: 'New submit flow.' };
const response = (data: unknown[], extra = {}) => ({ license: 'CC-BY-4.0', generatedAt: '2026-11-07T00:00:00Z', data, ...extra });
const input = (tools = [tool], categories = [category], license = 'CC-BY-4.0') => ({
	tools: { ...response(tools), license },
	categories: response(categories, { categoryNames: ['MCP', 'AI Coding'] }),
	changes: response([change]),
});
test('DevHunt keeps complete months sorted, with every category', () => {
	const data = parseDevHunt(input([{ ...tool, month: '2026-11' }, tool], [{ ...category, month: '2026-11' }, category]));
	assert.deepEqual(data.tools.map(({ month }) => month), ['2026-10', '2026-11']);
	assert.equal(data.tools[0].submitted, 3);
	assert.deepEqual(data.categories[0].counts, { MCP: 2, 'AI Coding': 0 });
	assert.deepEqual(data.changes, [change]);
});
test('DevHunt rejects a new license, partial months, bad counts and endpoints that disagree', () => {
	for (const bad of [
		input([tool], [category], 'CC-BY-NC-4.0'),
		input([{ ...tool, complete: false }]),
		input([tool, tool], [category, category]),
		input([{ ...tool, removed: -1 }]),
		input([tool], [{ ...category, submitted: 4 }]),
		input([tool], [{ ...category, counts: { MCP: 2 } }]),
		input([tool], [{ ...category, counts: { MCP: 4, 'AI Coding': 0 } }]),
		input([tool], []),
	]) assert.throws(() => parseDevHunt(bad));
});
