import { site } from '../content/site';
import styles from '../styles/global.css?raw';

// Geist Semibold (600), matching the site's score typography. Outlines keep
// SVG and PNG rendering identical without requiring installed system fonts.
// Glyphs extracted from Geist's Latin font; license: ../assets/geist-OFL.txt.
import glyphData from '../assets/favicon-glyphs.json';
const digits: Record<string, { path: string; width: number; bounds: number[] }> = glyphData;

export function faviconSvg() {
 const value = typeof site.score === 'number' && Number.isFinite(site.score)
  ? String(Math.round(Math.max(0, Math.min(100, site.score)))) : '?';
 const color = (name: string) => {
  const match = styles.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing favicon theme color: ${name}`);
  return match[1];
 };
 const glyphs = [...value].map((digit) => digits[digit]);
 const spacing = -50; // Match the score's -0.05em tracking (1000 units/em).
 let cursor = 0;
 const paths = glyphs.map((glyph) => {
  const path = `<path transform="translate(${cursor} 0)" d="${glyph.path}"/>`;
  cursor += glyph.width + spacing;
  return path;
 }).join('');
 const left = glyphs[0].bounds[0];
 const right = cursor - spacing - glyphs.at(-1)!.width + glyphs.at(-1)!.bounds[2];
 const bottom = Math.min(...glyphs.map((glyph) => glyph.bounds[1]));
 const top = Math.max(...glyphs.map((glyph) => glyph.bounds[3]));
 const scale = Math.min(52 / (right - left), 46 / (top - bottom));
 const x = (64 - (right - left) * scale) / 2 - left * scale;
 const y = (64 - (top - bottom) * scale) / 2 + top * scale;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color('bg')}"/><g transform="translate(${x} ${y}) scale(${scale} ${-scale})" fill="${color('accent')}">${paths}</g></svg>`;
}
