import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const signals = defineCollection({
	loader: glob({ pattern: '*.json', base: './src/content/signals' }),
	schema: z.object({
		order: z.number(),
		name: z.string(),
		question: z.string(),
		metric: z.string(),
		solvedIf: z.string(),
		// A signal is only published once it has a value.
		value: z.string().optional(),
		change: z.string().optional(),
		trend: z.array(z.number()).optional(),
	}),
});

const sources = defineCollection({
	loader: glob({ pattern: '*.json', base: './src/content/sources' }),
	schema: z.object({
		name: z.string(),
		url: z.url().optional(),
		signal: reference('signals'),
		measures: z.string().optional(),
		checked: z.string().optional(),
	}),
});

export const collections = { signals, sources };
