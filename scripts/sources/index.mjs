import { fetchAiCompanyJobs } from './ai-company-jobs.mjs';
import { fetchAgentPrs } from './agent-prs.mjs';
import { fetchBenchmarks } from './benchmarks.mjs';
import { fetchBlsPrices } from './bls-prices.mjs';
import { fetchBls } from './bls.mjs';
import { fetchCisaKev } from './cisa-kev.mjs';
import { fetchEconomy } from './economy.mjs';
import { fetchExploitDb } from './exploit-db.mjs';
import { fetchFedFunds } from './fed-funds.mjs';
import { fetchGithubMcp } from './github-mcp.mjs';
import { fetchHackerNews } from './hacker-news.mjs';
import { fetchHibp } from './hibp.mjs';
import { fetchHttpArchive } from './http-archive.mjs';
import { fetchIndeed } from './indeed.mjs';
import { fetchInnovationGraph } from './innovation-graph.mjs';
import { fetchLitellm } from './litellm.mjs';
import { fetchMcpRegistry } from './mcp-registry.mjs';
import { fetchModelsDev } from './models-dev.mjs';
import { fetchNoCode } from './no-code.mjs';
import { fetchNpm } from './npm.mjs';
import { fetchNvd } from './nvd.mjs';
import { fetchOsv } from './osv.mjs';
import { fetchOpenRouter } from './openrouter.mjs';
import { fetchOutsourcing } from './outsourcing.mjs';
import { fetchPwnWatch } from './pwn-watch.mjs';
import { fetchSec } from './sec.mjs';
import { fetchStackOverflow } from './stack-overflow.mjs';
import { fetchStatusPages } from './status-pages.mjs';
import { fetchTechOutput } from './tech-output.mjs';
import { fetchUneed } from './uneed.mjs';

// One entry per source. Each stores everything it can get under data/raw/<source>.
export const sources = {
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
};
