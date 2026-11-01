import { defineMiddleware } from 'astro:middleware';

const LINK = /<a\b[^>]*?\shref="(https?:\/\/[^"]+)"/g;

// Lets the sites we link to see where their visitors came from.
const withUtm = (href: string) => {
	const url = new URL(href.replaceAll('&amp;', '&'));
	// GitHub doesn't show repository owners these, so they'd only clutter the URL.
	if (url.hostname !== 'github.com' && !url.searchParams.has('utm_source')) {
		url.searchParams.set('utm_source', 'issoftwaresolved.com');
		url.searchParams.set('utm_medium', 'referral');
	}
	return url.href.replaceAll('&', '&amp;');
};

export const onRequest = defineMiddleware(async (_context, next) => {
	const response = await next();
	if (!response.headers.get('content-type')?.includes('text/html')) return response;
	const html = (await response.text()).replace(LINK, (tag, href) => tag.replace(href, withUtm(href)));
	return new Response(html, response);
});
