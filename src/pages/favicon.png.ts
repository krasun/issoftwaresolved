import sharp from 'sharp';
import { faviconSvg } from '../lib/favicon';

export const prerender = true;
export async function GET() {
 const image = await sharp(Buffer.from(faviconSvg())).resize(256, 256).png().toBuffer();
 return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/png' } });
}
