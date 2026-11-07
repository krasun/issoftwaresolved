import { fetchAiCompanyJobs } from './ai-company-jobs.ts';
import { fetchAgentPrs } from './agent-prs.ts';
import { fetchBenchmarks } from './benchmarks.ts';
import { fetchBlsPrices } from './bls-prices.ts';
import { fetchBls } from './bls.ts';
import { fetchCisaKev } from './cisa-kev.ts';
import { fetchDevHunt } from './devhunt.ts';
import { fetchEconomy } from './economy.ts';
import { fetchExploitDb } from './exploit-db.ts';
import { fetchFedFunds } from './fed-funds.ts';
import { fetchGithubMcp } from './github-mcp.ts';
import { fetchHackerNews } from './hacker-news.ts';
import { fetchHibp } from './hibp.ts';
import { fetchHttpArchive } from './http-archive.ts';
import { fetchIndeed } from './indeed.ts';
import { fetchInnovationGraph } from './innovation-graph.ts';
import { fetchLayoffs } from './layoffs.ts';
import { fetchLitellm } from './litellm.ts';
import { fetchMcpRegistry } from './mcp-registry.ts';
import { fetchModelsDev } from './models-dev.ts';
import { fetchNoCode } from './no-code.ts';
import { fetchNpm } from './npm.ts';
import { fetchNvd } from './nvd.ts';
import { fetchOsv } from './osv.ts';
import { fetchOpenRouter } from './openrouter.ts';
import { fetchOutsourcing } from './outsourcing.ts';
import { fetchProductHunt } from './product-hunt.ts';
import { fetchPwnWatch } from './pwn-watch.ts';
import { fetchSec } from './sec.ts';
import { fetchStackOverflow } from './stack-overflow.ts';
import { fetchStatusPages } from './status-pages.ts';
import { fetchTechOutput } from './tech-output.ts';
import { fetchUneed } from './uneed.ts';

export type Source = () => Promise<void>;

// One entry per source. Each stores everything it can get under data/raw/<source>.
export const sources: Record<string, Source> = {
	'cisa-kev': fetchCisaKev,
	hibp: fetchHibp,
	'exploit-db': fetchExploitDb,
	'pwn-watch': fetchPwnWatch,
	nvd: fetchNvd,
	osv: fetchOsv,
	indeed: fetchIndeed,
	bls: fetchBls,
	'hacker-news': fetchHackerNews,
	'status-pages': fetchStatusPages,
	sec: fetchSec,
	'bls-prices': fetchBlsPrices,
	litellm: fetchLitellm,
	npm: fetchNpm,
	'innovation-graph': fetchInnovationGraph,
	'fed-funds': fetchFedFunds,
	uneed: fetchUneed,
	devhunt: fetchDevHunt,
	'product-hunt': fetchProductHunt,
	outsourcing: fetchOutsourcing,
	economy: fetchEconomy,
	openrouter: fetchOpenRouter,
	'tech-output': fetchTechOutput,
	'stack-overflow': fetchStackOverflow,
	'no-code': fetchNoCode,
	'http-archive': fetchHttpArchive,
	'agent-prs': fetchAgentPrs,
	benchmarks: fetchBenchmarks,
	'ai-company-jobs': fetchAiCompanyJobs,
	'github-mcp': fetchGithubMcp,
	'mcp-registry': fetchMcpRegistry,
	'models-dev': fetchModelsDev,
	layoffs: fetchLayoffs,
};
