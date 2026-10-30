type Site = {
	verdict?: string;
	score?: number;
	updated?: string;
	history?: { year: number; score: number }[];
};

// Anything left out here is not rendered.
export const site: Site = {};
