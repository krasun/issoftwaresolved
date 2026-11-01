import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

// Asks a fixed prompt to AI models from several labs and generations, and keeps their scores.
// Models don't change once released, so each one is only asked until it has RUNS answers, and new releases are added.
// Run by hand with `npm run models:ask`, or `-- --dry-run` to list the models. It spends OpenRouter credits and stops at BUDGET.
export const PROMPT = `Is software solved?

By "solved" I mean that AI can do nearly all the software engineering work humans do today, including deciding what to build, writing it, running it and fixing it, with little human oversight and at low cost, so that few human software engineers are still needed.

Give your honest assessment of how close the world is to that today, as far as you know.

Reply with JSON only, in this exact format:
{"score": <a whole number from 0 to 100, where 0 means not at all and 100 means fully solved>, "reason": "<one sentence>"}`;

const RUNS = 3;
const BUDGET = 2;
const MAX_PRICE = 30 / 1e6;
const WANTED = [
	/^openai\/gpt-3\.5-turbo$/, /^openai\/gpt-4$/, /^openai\/gpt-4o$/, /^openai\/gpt-5$/, /^openai\/gpt-5\.5$/, /^openai\/gpt-6-sol$/, /^openai\/gpt-6\.1-sol$/,
	/^anthropic\/claude-3-haiku$/, /^anthropic\/claude-3\.5-haiku$/, /^anthropic\/claude-3\.7-sonnet$/, /^anthropic\/claude-sonnet-4\.6$/, /^anthropic\/claude-opus-4\.8$/, /^anthropic\/claude-sonnet-5\.5$/, /^anthropic\/claude-opus-5\.5$/,
	/^google\/gemini-2\.0-flash-001$/, /^google\/gemini-2\.5-flash$/, /^google\/gemini-3\.8-flash$/, /^google\/gemini-4-argon$/,
	/^deepseek\/deepseek-chat$/, /^deepseek\/deepseek-r1$/, /^deepseek\/deepseek-v4\.1-flash$/,
	/^x-ai\/grok-3$/, /^x-ai\/grok-4$/, /^x-ai\/grok-4\.7$/,
	/^meta-llama\/llama-3\.1-8b-instruct$/, /^meta-llama\/llama-3\.3-70b-instruct$/, /^meta-llama\/llama-4-maverick$/,
	/^mistralai\/mistral-large$/, /^qwen\/qwen-2\.5-7b-instruct$/,
];
// Newer models from these labs join the survey on their own. Variants would count the same model twice.
const LABS = new Set(['openai', 'anthropic', 'google', 'deepseek', 'x-ai', 'meta-llama', 'mistralai', 'qwen']);
const VARIANT = /:|preview|image|audio|embed|guard|safety|search|realtime|tts/i;
const PATH = 'data/raw/model-opinions/answers.json';
const dryRun = process.argv.includes('--dry-run');
const today = new Date().toISOString().slice(0, 10);

await mkdir('data/raw/model-opinions', { recursive: true });
let saved = await readFile(PATH, 'utf8').then(JSON.parse).catch(() => null);
// Scores from different prompts can't be compared, so a changed prompt starts over and keeps the old answers.
if (saved && saved.prompt !== PROMPT) {
	if (!dryRun) await rename(PATH, `data/raw/model-opinions/answers-${createHash('sha256').update(saved.prompt).digest('hex').slice(0, 8)}.json`);
	saved = null;
}
const answers = new Map((saved?.answers ?? []).map((answer) => [answer.model, answer]));
const newest = Math.max(0, ...[...answers.values()].map(({ released }) => Date.parse(released) / 1000));
const isNew = ({ id, created, architecture }) =>
	newest > 0 && created > newest + 86400 && LABS.has(id.split('/')[0]) && !VARIANT.test(id) && (architecture?.output_modalities ?? ['text']).join() === 'text';
const save = () => {
	const sorted = [...answers.values()].sort((a, b) => a.released.localeCompare(b.released));
	return writeFile(PATH, `${JSON.stringify({ asked: today, prompt: PROMPT, answers: sorted }, null, '\t')}\n`);
};

const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error('OPENROUTER_API_KEY is not set');
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'user-agent': 'issoftwaresolved-index' };
const usage = async () => (await (await fetch('https://openrouter.ai/api/v1/key', { headers })).json()).data.usage;

const { data } = await (await fetch('https://openrouter.ai/api/v1/models')).json();
const models = data
	.filter((model) => WANTED.some((pattern) => pattern.test(model.id)) || isNew(model))
	.filter(({ id, pricing }) => (answers.get(id)?.runs.length ?? 0) < RUNS && Number(pricing.prompt) <= MAX_PRICE && Number(pricing.completion) <= MAX_PRICE * 4)
	.sort((a, b) => a.created - b.created);
console.log(`${models.length} models to ask: ${models.map(({ id }) => id).join(', ')}`);
if (dryRun || models.length === 0) process.exit();

const start = await usage();
for (const { id, name, created } of models) {
	let attempts = RUNS - (answers.get(id)?.runs.length ?? 0);
	if ((await usage()) - start >= BUDGET) {
		console.log(`Stopped at the $${BUDGET} budget`);
		break;
	}
	const runs = [...(answers.get(id)?.runs ?? [])];
	while (attempts-- > 0) {
		try {
			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers,
				body: JSON.stringify({ model: id, messages: [{ role: 'user', content: PROMPT }], max_tokens: 1500 }),
				signal: AbortSignal.timeout(120_000),
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const text = (await response.json()).choices?.[0]?.message?.content ?? '';
			const match = text.match(/\{[\s\S]*\}/);
			const parsed = match ? JSON.parse(match[0]) : {};
			if (Number.isFinite(parsed.score) && parsed.score >= 0 && parsed.score <= 100) runs.push({ score: parsed.score, reason: String(parsed.reason ?? '').slice(0, 200) });
		} catch (error) {
			console.log(`${id}: ${error.message.slice(0, 80)}`);
		}
	}
	answers.set(id, { model: id, name, lab: id.split('/')[0], released: new Date(created * 1000).toISOString().slice(0, 10), runs });
	await save();
	console.log(`${id}: ${runs.map(({ score }) => score).join(', ') || 'no answer'}`);
}
console.log(`Spent about $${((await usage()) - start).toFixed(2)}`);
