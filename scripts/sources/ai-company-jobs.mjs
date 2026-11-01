import { mkdir, writeFile } from 'node:fs/promises';
import { request } from './lib.mjs';

const ashby = (slug) => ({
	url: `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
	titles: ({ jobs }) => jobs.map(({ title }) => title),
});
const greenhouse = (slug) => ({
	url: `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
	titles: ({ jobs }) => jobs.map(({ title }) => title),
});
const COMPANIES = {
	OpenAI: ashby('openai'),
	Anthropic: greenhouse('anthropic'),
	Mistral: ashby('mistral.ai'),
	xAI: greenhouse('xai'),
	Cohere: ashby('cohere'),
	Perplexity: ashby('perplexity'),
	Cursor: ashby('cursor'),
	Cognition: ashby('cognition'),
	Replit: ashby('replit'),
	Lovable: ashby('lovable'),
	Factory: ashby('factory'),
};

// Roles that write product or infrastructure code, not roles that sell or support it.
const ENGINEERING =
	/software engineer|software developer|\bswe\b|\bsre\b|site reliability|(backend|back-end|frontend|front-end|full[- ]?stack|infrastructure|platform|product|systems|distributed systems|mobile|ios|android|web|devops|developer tools|inference|kernel|compiler)\b[^,]*\bengineer\b|member of technical staff/i;
const EXCLUDED =
	/forward[- ]deployed|solutions|support|sales|field engineer|customer|deployment|gtm|recruit|manager|research engineer|security|data engineer|hardware|design engineer|analytics/i;

// Only the counts are kept, not the job listings.
export const fetchAiCompanyJobs = async () => {
	const companies = {};
	for (const [name, { url, titles }] of Object.entries(COMPANIES)) {
		const all = titles(await (await request(url)).json());
		const engineering = all.filter((title) => ENGINEERING.test(title) && !EXCLUDED.test(title));
		companies[name] = { open: all.length, engineering: engineering.length };
	}
	await mkdir('data/raw/ai-company-jobs', { recursive: true });
	await writeFile(
		'data/raw/ai-company-jobs/latest.json',
		`${JSON.stringify({ date: new Date().toISOString().slice(0, 10), companies }, null, '\t')}\n`,
	);
	console.log(`AI company jobs: ${Object.entries(companies).map(([name, { engineering }]) => `${name} ${engineering}`).join(', ')}`);
};
