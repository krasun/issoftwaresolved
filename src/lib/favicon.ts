import { site } from '../content/site';
import styles from '../styles/global.css?raw';

// Slightly irregular, rounded pen strokes remain readable at tab-icon sizes.
const digits: Record<string, string> = {
 '0': 'M12 3 C-1 2 -1 39 11 39 C24 40 25 3 12 3Z',
 '1': 'M4 11 L12 3 L11 38 M4 39 L20 38',
 '2': 'M2 10 C4 -1 24 0 22 12 C21 21 6 28 2 38 L23 38',
 '3': 'M2 5 C26 -3 28 18 12 20 C29 18 27 44 2 37',
 '4': 'M17 39 L18 3 L1 27 L24 26',
 '5': 'M23 3 L4 4 L3 20 C27 10 31 44 2 37',
 '6': 'M21 4 C2 -3 -4 39 12 39 C29 39 26 15 11 20 L3 25',
 '7': 'M1 4 L24 3 C16 16 12 28 9 39',
 '8': 'M12 20 C-6 13 3 0 13 3 C29 5 24 17 12 20 C-5 23 -1 40 12 39 C29 39 28 23 12 20Z',
 '9': 'M21 19 C-3 29 -4 1 12 3 C28 3 26 34 6 39',
 '?': 'M2 9 C4 -2 25 0 22 12 C21 20 11 19 11 27 M11 37 L11 38',
};

export function faviconSvg() {
 const value = typeof site.score === 'number' && Number.isFinite(site.score)
  ? String(Math.round(Math.max(0, Math.min(100, site.score)))) : '?';
 const color = (name: string) => {
  const match = styles.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing favicon theme color: ${name}`);
  return match[1];
 };
 const width = value.length * 29 - 5;
 const scale = Math.min(1.3, 54 / (width + 5));
 const paths = [...value].map((digit, i) => `<path transform="translate(${i * 29} 0)" d="${digits[digit]}"/>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${color('bg')}"/><g transform="translate(${(64 - width * scale) / 2} ${(64 - 42 * scale) / 2}) scale(${scale})" fill="none" stroke="${color('accent')}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}
