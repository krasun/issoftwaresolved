import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const signals = defineCollection({
	loader: glob({ pattern: '*.json', base: './src/content/signals' }),
	schema: z.object({
		order: z.number(),
		group: z.string(),
		name: z.string(),
		question: z.string(),
		metric: z.string(),
		solvedIf: z.string(),
		// A signal is only published once it has a value.
		value: z.string().optional(),
		change: z.string().optional(),
		trend: z.array(z.object({ label: z.string(), value: z.number() })).optional(),
		// `time` spaces points by their dates. `category` spaces them evenly.
		trendScale: z.enum(['time', 'category']).optional(),
		trendLabel: z.string().optional(),
		chartNote: z.string().optional(),
		caution: z.array(z.string()).optional(),
		prompt: z.string().optional(),
		quote: z.object({ author: z.string(), role: z.string(), url: z.string(), image: z.string(), text: z.string() }).optional(),
		score: z.number().optional(),
		scoreReason: z.string().optional(),
		// Points are matched to the trend by label, and may stop short of the latest one.
		comparison: z.object({ name: z.string(), sameAxis: z.boolean().optional(), trend: z.array(z.object({ label: z.string(), value: z.number() })) }).optional(),
		trendName: z.string().optional(),
		events: z.array(z.object({ month: z.string(), label: z.string() })).optional(),
		analysis: z.object({ title: z.string(), intro: z.string(), points: z.array(z.string()) }).optional(),
		// The last year of the trend, rebased so its start is 100.
		recent: z.array(z.number()).optional(),
		fromHigh: z.string().optional(),
		// A plain-word reading, the rule behind it, and whether it moves toward solved.
		status: z.string().optional(),
		rule: z.string().optional(),
		direction: z.enum(['toward', 'away', 'flat']).optional(),
	}),
});

const sources = defineCollection({
	loader: glob({ pattern: '*.json', base: './src/content/sources' }),
	schema: z.object({
		name: z.string(),
		url: z.url().optional(),
		signal: reference('signals'),
		// `headline` produces the signal's number. `context` only has its own analysis.
		dataPolicy: z.enum(['full-copy', 'numbers-only', 'quote-only']).optional(),
		role: z.enum(['headline', 'context']),
		measures: z.string().optional(),
		about: z.string().optional(),
		attribution: z.string().optional(),
		license: z.string().optional(),
		licenseUrl: z.url().optional(),
		limitations: z.array(z.string()).optional(),
		checked: z.string().optional(),
	}),
});

export const collections = { signals, sources };
