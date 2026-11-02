import score from '../../data/score.json';

type Site = {
	verdict?: string;
	score?: number;
	scoreRange?: { low: number; high: number };
	updated?: string;
	areas?: { name: string; note?: string; score: number; signals: { id: string; weight: number; source?: string; href: string; name: string; score: number; reason: string }[] }[];
	history?: { date: string; score: number }[];
	checks?: { date: string; score: number }[];
};

// Written by `npm run index`.
export const site: Site = score;
