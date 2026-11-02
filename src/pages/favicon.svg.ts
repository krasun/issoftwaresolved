import { faviconSvg } from '../lib/favicon';

export const prerender = true;
export function GET() {
 return new Response(faviconSvg(), { headers: { 'Content-Type': 'image/svg+xml' } });
}
