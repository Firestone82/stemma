/**
 * The page after a print that lists its settings (PrintSettings.settingsPage): what paper, who is in the middle,
 * how the families are arranged, where the title and the families' names stand (centimetres from the paper's
 * edges), so the same print can be made again. A4 portrait, drawn in the poster's own colours and lettering.
 */
import { escapeText } from '../xml/xml-writer';
import { palette } from './heritage';

export interface SettingsSheet {
  title: string;
  subtitle: string;
  sections: { heading: string; rows: [label: string, value: string][] }[];
  footer: string;
}

/** A4 portrait in CSS pixels (96 per inch). */
export const SETTINGS_PAGE = { w: 794, h: 1123, widthMm: 210, heightMm: 297 };

const HEAD = "'Alegreya Variable', Georgia, serif";
const SANS = "'Alegreya Sans', 'Segoe UI', sans-serif";

/** Every character the page uses, for embedding the fonts. */
export function settingsText(sheet: SettingsSheet): string {
  return [sheet.title, sheet.subtitle, sheet.footer, ...sheet.sections.flatMap((s) => [s.heading, ...s.rows.flat()])].join(' ');
}

export function settingsPageSvg(sheet: SettingsSheet): string {
  const { w, h } = SETTINGS_PAGE;
  const m = 56;
  const colGap = 34;
  const colW = (w - m * 2 - colGap) / 2;
  const row = 21;
  const headH = 48;
  const text = (x: number, y: number, s: string, size: number, fill: string, extra = '') =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" fill="${fill}" ${extra}>${escapeText(s)}</text>`;
  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="${palette.paper}"/>` +
    `<rect x="22" y="22" width="${w - 44}" height="${h - 44}" fill="none" stroke="${palette.accent}" stroke-width="1.6"/>` +
    `<rect x="28" y="28" width="${w - 56}" height="${h - 56}" fill="none" stroke="${palette.accent}" stroke-width="0.6"/>` +
    text(w / 2, 100, sheet.title, 34, palette.accent, `text-anchor="middle" font-family="${HEAD}" font-weight="600"`) +
    text(w / 2, 128, sheet.subtitle, 15, palette.muted, `text-anchor="middle" font-family="${SANS}" font-style="italic"`) +
    `<path d="M${m},146H${w / 2 - 12}M${w / 2 + 12},146H${w - m}" stroke="${palette.accent}" stroke-width="0.8"/>` +
    `<path d="M${w / 2},140L${w / 2 + 6},146L${w / 2},152L${w / 2 - 6},146Z" fill="${palette.accent}"/>`;
  // Sections down the left column and then the right, a section never split across them.
  const heights = sheet.sections.map((s) => headH + s.rows.length * row + 12);
  const total = heights.reduce((a, b) => a + b, 0);
  const room = h - 190 - 70;
  let col = 0;
  let y = 190;
  const limit = Math.max(room, total / 2 + 40);
  sheet.sections.forEach((s, i) => {
    if (col === 0 && y - 190 + heights[i] > limit && i > 0) {
      col = 1;
      y = 190;
    }
    const x = m + col * (colW + colGap);
    out += text(x, y + 20, s.heading.toUpperCase(), 13.5, palette.accent, `font-family="${SANS}" font-weight="700" letter-spacing="1.4"`);
    out += `<path d="M${x},${y + 28}H${x + colW}" stroke="${palette.cardEdge}" stroke-width="0.6"/>`;
    s.rows.forEach(([label, value], r) => {
      const ry = y + headH + r * row - 2;
      out += text(x, ry, label, 13.5, palette.muted, `font-family="${SANS}"`);
      out += text(x + colW, ry, value, 13.5, palette.ink, `text-anchor="end" font-family="${SANS}" font-weight="600"`);
    });
    y += heights[i];
  });
  out += text(w / 2, h - 52, sheet.footer, 12, palette.faint, `text-anchor="middle" font-family="${SANS}" font-style="italic"`);
  return out + '</svg>';
}
