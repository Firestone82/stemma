/**
 * Heritage, the print style: a family register on vellum. Iron-gall ink, an oxblood double frame with corner
 * flourishes, the title between double rules that carry the counts and the date it was drawn, and the
 * families' shields under the tree. The cards and lines are drawn by poster.ts in these colours.
 */
import { LegendEntry, Tincture } from '../colors/tinctures';
import { yearSpan } from '../lang/language';
import { FontSpec, PageBlock, PosterContext, Rect } from './poster-types';
import { el, fontAttrs, n, shieldPath, specklePattern, text } from './svg';

/** The bundled faces, as SVG font-family lists. Exports embed these. */
export const SERIF = "'Alegreya Variable', Alegreya, Georgia, serif";
export const SMALL_CAPS = "'Alegreya SC', 'Alegreya Variable', Georgia, serif";

const VELLUM_LIGHT = '#f6eedb';
export const GOLD = '#a47d35';

export const palette = {
  paper: '#eee1c3',
  ink: '#2e2117',
  muted: '#5c4733',
  faint: '#836c55',
  line: '#4b3828',
  /** The direct line of the people the page is drawn around. */
  trunk: '#7b2c23',
  accent: '#7b2c23',
  card: '#f8f1df',
  cardEdge: '#8b7255',
  /** The sex accent: the band down the card's edge and the tint of the card. */
  male: '#2f4e7a',
  female: '#8e2e45',
  other: '#6b6557',
  cardMale: '#f1f0e8',
  cardFemale: '#f8ecdf',
  /** The slash across the rings of a couple who divorced, and the badge of a mistake. */
  break: '#9c2f22',
  warn: '#b8862b',
};

export const tinctures: Record<Tincture, { fill: string; ink: string; edge?: string }> = {
  // Heraldic, but each plainly unlike the others on the vellum: blue, red, green, gold, purple, orange, teal,
  // pink, black, lime, brown, sky, wine, grey.
  azure: { fill: '#1f4f9e', ink: VELLUM_LIGHT },
  gules: { fill: '#b3262a', ink: VELLUM_LIGHT },
  vert: { fill: '#2b7a37', ink: VELLUM_LIGHT },
  purpure: { fill: '#68338f', ink: VELLUM_LIGHT },
  or: { fill: '#d4a019', ink: '#2e2117' },
  tenne: { fill: '#d0621a', ink: VELLUM_LIGHT },
  sanguine: { fill: '#741a35', ink: VELLUM_LIGHT },
  celeste: { fill: '#3f97d0', ink: VELLUM_LIGHT },
  sable: { fill: '#1f1c1a', ink: VELLUM_LIGHT },
  teal: { fill: '#0f8089', ink: VELLUM_LIGHT },
  rose: { fill: '#c43f7f', ink: VELLUM_LIGHT },
  olive: { fill: '#7d9614', ink: VELLUM_LIGHT },
  cendree: { fill: '#8e8a84', ink: VELLUM_LIGHT },
  brunatre: { fill: '#6b3f1c', ink: VELLUM_LIGHT },
  argent: { fill: VELLUM_LIGHT, ink: '#4b3828', edge: '#8b7255' },
};

/** The title's and the families' names' letters, in page units (see PosterContext.page). */
export const LETTERING = { title: 4.2, legend: 1.25 };
/** Page margin as a share of the page's shorter side. */
export const MARGIN = 0.05;
/** Faces to load before measuring, as CSS font shorthand. */
export const FONTS: readonly string[] = [
  "600 16px 'Alegreya Variable'",
  "italic 400 16px 'Alegreya Variable'",
  "500 16px 'Alegreya SC'",
  "700 16px 'Alegreya Sans'",
];

export const heritage = {
  /** The paper; with `framed`, the double frame round the page too. */
  background(c: PosterContext, framed: boolean): string {
    const { w, h } = c.page;
    c.def('pp-hl-specks', specklePattern('pp-hl-specks', 160, '#6b4b24', 110, 11, 0.9, 0.2));
    c.def(
      'pp-hl-vignette',
      '<radialGradient id="pp-hl-vignette" cx="50%" cy="46%" r="74%"><stop offset="58%" stop-color="#a98446" stop-opacity="0"/><stop offset="100%" stop-color="#8e6b35" stop-opacity="0.36"/></radialGradient>',
    );
    const f = frame(c);
    return (
      el('rect', { width: w, height: h, fill: palette.paper }) +
      el('rect', { width: w, height: h, fill: 'url(#pp-hl-specks)' }) +
      el('rect', { width: w, height: h, fill: 'url(#pp-hl-vignette)' }) +
      (!framed
        ? ''
        : el('rect', {
            x: f.outer.x,
            y: f.outer.y,
            width: f.outer.w,
            height: f.outer.h,
            fill: 'none',
            stroke: palette.accent,
            'stroke-width': c.page.u * 0.26,
          }) +
          el('rect', {
            x: f.inner.x,
            y: f.inner.y,
            width: f.inner.w,
            height: f.inner.h,
            fill: 'none',
            stroke: palette.accent,
            'stroke-width': c.page.u * 0.08,
          }))
    );
  },

  header(c: PosterContext): PageBlock {
    const u = c.page.u;
    const titleFont: FontSpec = { family: SMALL_CAPS, size: u * LETTERING.title, weight: 500, letterSpacing: 0.14 };
    const wingFont: FontSpec = { family: SERIF, size: u * 1.5, style: 'italic' };
    // Under the title only the divider; what was under it is now on the wings.
    const height = u * 1.4 + titleFont.size * 1.1 + u * 3.4;
    const drawn = c.language.drawn(c.now);
    const years = c.years ? yearSpan(c.years.from, c.years.to) : '';
    /** How far the rules reach out from the middle to either side. */
    const reachOf = (r: Rect) => {
      const half = Math.min(c.measure(c.title, titleFont), r.w * 0.5) / 2 + u * 2.4;
      const longest = Math.max(c.subtitle ? c.measure(c.subtitle, wingFont) : 0, c.measure(drawn, wingFont), years ? c.measure(years, wingFont) : 0);
      return Math.min(r.w * 0.47, half + Math.max(u * 24, longest + u * 7));
    };
    return {
      height,
      extent(r: Rect) {
        const reach = reachOf(r);
        return { x: r.x + r.w / 2 - reach, y: r.y, w: reach * 2, h: height };
      },
      draw(r: Rect) {
        const cx = r.x + r.w / 2;
        const maxText = r.w * 0.5;
        const tw = c.measure(c.title, titleFont);
        const font = tw > maxText ? { ...titleFont, size: (titleFont.size * maxText) / tw } : titleFont;
        const ty = r.y + u * 1.4 + font.size * 0.9;
        let out = el('text', { x: cx, y: ty, 'text-anchor': 'middle', ...fontAttrs(font), fill: palette.accent }, text(c.title));
        // Double rules reach out from the title to both sides, a lozenge at the title and a dot at the far end.
        // On the left wing how many generations and people; on the right when it was drawn, and the years under the rule.
        const half = Math.min(tw, maxText) / 2 + u * 2.4;
        const longest = Math.max(c.subtitle ? c.measure(c.subtitle, wingFont) : 0, c.measure(drawn, wingFont), years ? c.measure(years, wingFont) : 0);
        const reach = Math.min(r.w * 0.47, half + Math.max(u * 24, longest + u * 7));
        const ry = ty - font.size * 0.34;
        out += flank(cx - half, cx - reach, ry, u);
        out += flank(cx + half, cx + reach, ry, u);
        const wing = reach - half - u * 3.5;
        const wingText = (s: string, side: -1 | 1, below: boolean) => {
          if (!s) return '';
          const w = c.measure(s, wingFont);
          const f = w > wing ? { ...wingFont, size: (wingFont.size * wing) / w } : wingFont;
          const y = below ? ry + u * 0.5 + u * 0.8 + f.size * 0.8 : ry - u * 0.85;
          return el('text', { x: cx + (side * (half + reach)) / 2, y, 'text-anchor': 'middle', ...fontAttrs(f), fill: palette.muted }, text(s));
        };
        out += wingText(c.subtitle, -1, false);
        out += wingText(drawn, 1, false);
        out += wingText(years, 1, true);
        out += divider(cx, ty + font.size * 0.2 + u * 1.6, u);
        return out;
      },
    };
  },

  footer(c: PosterContext): PageBlock {
    const u = c.page.u;
    const lu = c.page.lu ?? u;
    const legend = legendItems(c);
    const below = c.legendAt === 'below' && legend.length > 0;
    // The families' shields in rows across the foot of the page, unless they are in a column beside the tree.
    const rows = below ? wrapRows(legend, c.page.w - c.page.margin * 2, LEGEND_GAP * lu) : [];
    const height = u * 1.2 + rows.length * LEGEND_ROW * lu;
    const rowW = (row: LegendItem[]) => row.reduce((s, it) => s + it.w, 0) + LEGEND_GAP * lu * (row.length - 1);
    return {
      height,
      legend(r: Rect) {
        if (!rows.length) return undefined;
        const w = Math.max(...rows.map(rowW));
        return { x: r.x + (r.w - w) / 2, y: r.y + u * 0.6, w, h: rows.length * LEGEND_ROW * lu };
      },
      draw(r: Rect) {
        let out = '';
        rows.forEach((row, i) => {
          const total = row.reduce((s, it) => s + it.w, 0) + LEGEND_GAP * lu * (row.length - 1);
          let x = r.x + (r.w - total) / 2;
          const y = r.y + u * 0.6 + (i + 0.5) * LEGEND_ROW * lu;
          for (const it of row) {
            out += legendEntry(c, it, x, y);
            x += it.w + LEGEND_GAP * lu;
          }
        });
        return out;
      },
    };
  },

  legendStyle: {
    font: { family: SMALL_CAPS, size: 1, weight: 500, letterSpacing: 0.04 },
    ink: palette.muted,
    markW: 1.04,
    markGap: 0.48,
    mark(l: LegendEntry, x: number, y: number, size: number): string {
      const w = size * 1.04;
      const t = tinctures[l.tincture];
      return `<g transform="translate(${n(x)},${n(y - w * 0.59)})">${el('path', { d: shieldPath(w, w * 1.18), fill: t.fill, stroke: t.edge, 'stroke-width': t.edge ? 0.6 : undefined })}</g>`;
    },
  },

  /**
   * How far the frame's corner flourishes reach into the page beyond its margin, with a little air: what stands
   * in a corner of the page keeps that far from the margin there. Nothing where they stay within the margin.
   */
  cornerClear(c: PosterContext): number {
    const { u, margin } = c.page;
    const over = frame(c).inner.x + u * FLOURISH - margin;
    return over > 0 ? over + u * 0.6 : 0;
  },

  decorationArea(c: PosterContext): Rect {
    const inner = frame(c).inner;
    const pad = c.page.u * 0.2;
    return { x: inner.x + pad, y: inner.y + pad, w: inner.w - pad * 2, h: inner.h - pad * 2 };
  },

  /** Drawn over everything: the frame's corner flourishes. */
  overlay(c: PosterContext): string {
    const f = frame(c).inner;
    const u = c.page.u;
    const s = u * FLOURISH;
    const corner = (x: number, y: number, sx: number, sy: number) =>
      `<g transform="translate(${n(x)},${n(y)}) scale(${(sx * s) / 50},${(sy * s) / 50})">${cornerOrnament()}</g>`;
    return (
      corner(f.x, f.y, 1, 1) +
      corner(f.x + f.w, f.y, -1, 1) +
      corner(f.x, f.y + f.h, 1, -1) +
      corner(f.x + f.w, f.y + f.h, -1, -1) +
      edgeOrnament(f.x + f.w / 2, f.y + f.h, u)
    );
  },
};

/** How big a corner flourish is, in the page's units. */
const FLOURISH = 5.2;

function frame(c: PosterContext): { outer: Rect; inner: Rect } {
  const { w, h, u, margin: m } = c.page;
  const o = m * 0.42;
  const i = o + u * 0.75;
  return {
    outer: { x: o, y: o, w: w - o * 2, h: h - o * 2 },
    inner: { x: i, y: i, w: w - i * 2, h: h - i * 2 },
  };
}

/** A ribbon banner with swallowtail ends folded behind. */
/** A double rule from `inner` (by the title) out to `outer`: a lozenge where it starts, a dot where it ends. */
function flank(inner: number, outer: number, y: number, u: number): string {
  const dir = outer > inner ? 1 : -1;
  const from = inner + dir * u * 1.3;
  return (
    el('path', { d: `M${n(from)},${n(y)}H${n(outer)}`, stroke: palette.accent, 'stroke-width': u * 0.12, 'stroke-linecap': 'round' }) +
    el('path', {
      d: `M${n(from)},${n(y + u * 0.5)}H${n(outer - dir * u * 2.2)}`,
      stroke: palette.accent,
      'stroke-width': u * 0.05,
      'stroke-linecap': 'round',
    }) +
    el('path', {
      d: `M${n(inner)},${n(y - u * 0.6)}L${n(inner + dir * u * 0.6)},${n(y)}L${n(inner)},${n(y + u * 0.6)}L${n(inner - dir * u * 0.6)},${n(y)}Z`,
      fill: palette.accent,
    }) +
    el('circle', { cx: outer, cy: y, r: u * 0.24, fill: palette.accent })
  );
}

/** A rule with a lozenge in the middle, under the title. */
function divider(cx: number, y: number, u: number): string {
  const s = { stroke: palette.accent, 'stroke-width': u * 0.09, 'stroke-linecap': 'round' as const };
  return (
    el('path', { d: `M${n(cx - u * 9)},${n(y)}H${n(cx - u * 1.6)}M${n(cx + u * 1.6)},${n(y)}H${n(cx + u * 9)}`, ...s }) +
    el('path', { d: `M${n(cx)},${n(y - u * 0.7)}L${n(cx + u * 0.7)},${n(y)}L${n(cx)},${n(y + u * 0.7)}L${n(cx - u * 0.7)},${n(y)}Z`, fill: palette.accent }) +
    el('circle', { cx: cx - u * 1.15, cy: y, r: u * 0.18, fill: palette.accent }) +
    el('circle', { cx: cx + u * 1.15, cy: y, r: u * 0.18, fill: palette.accent }) +
    el('circle', { cx: cx - u * 9.6, cy: y, r: u * 0.22, fill: palette.accent }) +
    el('circle', { cx: cx + u * 9.6, cy: y, r: u * 0.22, fill: palette.accent })
  );
}

/** A corner flourish in a 50×50 box, drawn for the top-left corner. */
function cornerOrnament(): string {
  const s = { fill: 'none', stroke: palette.accent, 'stroke-linecap': 'round' as const };
  return (
    el('path', { d: 'M2,2L10,2L10,10L2,10Z', fill: palette.accent }) +
    el('path', { d: 'M13,4C24,4 28,9 34,7C40,5 41,0 46,3', ...s, 'stroke-width': 1.3 }) +
    el('path', { d: 'M4,13C4,24 9,28 7,34C5,40 0,41 3,46', ...s, 'stroke-width': 1.3 }) +
    el('path', { d: 'M14,14C20,14 22,20 28,18C32,17 32,12 28,12C25,12 25,16 28,16', ...s, 'stroke-width': 0.9 }) +
    el('path', { d: 'M14,14C14,20 20,22 18,28C17,32 12,32 12,28C12,25 16,25 16,28', ...s, 'stroke-width': 0.9 }) +
    el('circle', { cx: 47.5, cy: 3.6, r: 1.6, fill: palette.accent }) +
    el('circle', { cx: 3.6, cy: 47.5, r: 1.6, fill: palette.accent })
  );
}

function edgeOrnament(cx: number, y: number, u: number): string {
  const s = u * 0.9;
  return `<g transform="translate(${n(cx)},${n(y)})">${el('path', { d: `M0,${n(-s)}L${n(s)},0L0,${n(s)}L${n(-s)},0Z`, fill: palette.paper, stroke: palette.accent, 'stroke-width': u * 0.1 })}${el('circle', { r: s * 0.32, fill: palette.accent })}</g>`;
}

/** Space between legend entries side by side, and the height of a row of them, in the legend's units (lu). */
const LEGEND_GAP = 2.2;
const LEGEND_ROW = 2.4;

interface LegendItem {
  l: LegendEntry;
  /** Shield and label together. */
  w: number;
}

const legendFont = (u: number): FontSpec => ({ family: SMALL_CAPS, size: u * LETTERING.legend, weight: 500, letterSpacing: 0.04 });

/** The families for the legend; the "other families" entry only next to real ones. */
function legendItems(c: PosterContext): LegendItem[] {
  const u = c.page.lu ?? c.page.u;
  return c.legend.filter((l) => l.key !== '' || c.legend.length > 1).map((l) => ({ l, w: u * 1.3 + u * 0.6 + c.measure(l.label, legendFont(u)) }));
}

/** Entries in rows no wider than `max`. */
function wrapRows(items: readonly LegendItem[], max: number, gap: number): LegendItem[][] {
  const rows: LegendItem[][] = [];
  let row: LegendItem[] = [];
  let w = 0;
  for (const it of items) {
    if (row.length && w + gap + it.w > max) {
      rows.push(row);
      row = [];
      w = 0;
    }
    w += (row.length ? gap : 0) + it.w;
    row.push(it);
  }
  if (row.length) rows.push(row);
  return rows;
}

/** A family's shield and name, the shield's left edge at `x` and the text's middle at `y`. */
function legendEntry(c: PosterContext, { l }: LegendItem, x: number, y: number): string {
  const u = c.page.lu ?? c.page.u;
  const shieldW = u * 1.3;
  const font = legendFont(u);
  const t = tinctures[l.tincture];
  return (
    `<g transform="translate(${n(x)},${n(y - shieldW * 0.62)})">${el('path', { d: shieldPath(shieldW, shieldW * 1.18), fill: t.fill, stroke: t.edge, 'stroke-width': t.edge ? 0.6 : undefined })}</g>` +
    el('text', { x: x + shieldW + u * 0.6, y: y + font.size * 0.32, ...fontAttrs(font), fill: palette.muted }, text(l.label))
  );
}
