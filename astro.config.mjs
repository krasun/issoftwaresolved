// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	fonts: [
		{
			provider: fontProviders.fontsource(),
			name: 'Geist',
			cssVariable: '--font-geist',
			weights: ['100 900'],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['system-ui', 'sans-serif'],
		},
		{
			provider: fontProviders.fontsource(),
			name: 'Geist Mono',
			cssVariable: '--font-geist-mono',
			weights: ['100 900'],
			styles: ['normal'],
			subsets: ['latin'],
			fallbacks: ['ui-monospace', 'monospace'],
		},
	],
});
