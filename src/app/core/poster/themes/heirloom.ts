/**
 * Heirloom: a family register on vellum. Iron-gall ink, an oxblood double
 * frame with corner flourishes, the title between double rules that carry the
 * counts and the date it was drawn, engraved name plates, gold rings for
 * marriages and the families' shields under the tree or beside it.
 */
import { LayoutCard, LayoutUnion } from '../../layout/layout-types';
import { yearSpan } from '../../lang/language';
import { LegendEntry } from '../../colors/tinctures';
import { CardLook, FontSpec, PageBlock, PosterContext, PosterTheme, Rect, UNKNOWN_DASH } from '../poster-types';
import { unionMark } from '../../layout/union-marks';
import { drawMark } from '../marks';
import { el, fontAttrs, n, shieldPath, specklePattern, text } from '../svg';
import { SANS, SERIF, SMALL_CAPS } from './fonts';

const VELLUM_LIGHT = '#f6eedb';
const GOLD = '#a47d35';

const palette = {
  paper: '#eee1c3',
  ink: '#2e2117',
  muted: '#5c4733',
  faint: '#836c55',
  line: '#4b3828',
  accent: '#7b2c23',
  card: '#f8f1df',
  cardEdge: '#8b7255',
  kin: '#7b2c23',
  cardMale: '#e2e8ee',
  cardFemale: '#f4e0db',
  male: '#2f4e7a',
  female: '#8e2e45',
  break: '#9c2f22',
};

export const heirloom: PosterTheme = {
  id: 'heirloom',
  name: 'Heirloom',
  description: 'Vellum, an ornamental frame, the title on a ribbon and engraved name plates.',
  flow: 'down',
  palette,
  swatch: [palette.paper, palette.ink, palette.accent],
  tinctures: {
    azure: { fill: '#2f4e7a', ink: VELLUM_LIGHT },
    gules: { fill: '#8e2e28', ink: VELLUM_LIGHT },
    vert: { fill: '#3d6744', ink: VELLUM_LIGHT },
    purpure: { fill: '#5a4376', ink: VELLUM_LIGHT },
    or: { fill: '#b98a2f', ink: '#2e2117' },
    tenne: { fill: '#a35727', ink: VELLUM_LIGHT },
    sanguine: { fill: '#782c42', ink: VELLUM_LIGHT },
    celeste: { fill: '#4d7c99', ink: VELLUM_LIGHT },
    sable: { fill: '#3a3029', ink: VELLUM_LIGHT },
    teal: { fill: '#2f6f68', ink: VELLUM_LIGHT },
    rose: { fill: '#b4607a', ink: VELLUM_LIGHT },
    olive: { fill: '#727126', ink: VELLUM_LIGHT },
    cendree: { fill: '#8c8579', ink: VELLUM_LIGHT },
    brunatre: { fill: '#6a4529', ink: VELLUM_LIGHT },
    argent: { fill: VELLUM_LIGHT, ink: '#4b3828', edge: '#8b7255' },
  },
  card: {
    width: 178,
    radius: 3,
    textX: 50,
    padRight: 12,
    top: 10,
    bottom: 11,
    badge: { kind: 'shield', x: 14, size: 24, font: { family: SANS, size: 10, weight: 700, letterSpacing: 0.02 } },
    photoRadius: 16,
    kin: { family: SMALL_CAPS, size: 10.5, weight: 500, letterSpacing: 0.07, step: 0 },
    given: { family: SERIF, size: 17.5, weight: 600, step: 18 },
    surname: { family: SMALL_CAPS, size: 14.5, weight: 500, letterSpacing: 0.02, step: 17.5 },
    birth: { family: SMALL_CAPS, size: 12, weight: 500, letterSpacing: 0.02, step: 15 },
    dates: { family: SERIF, size: 12.5, weight: 400, step: 16.5 },
    place: { family: SERIF, size: 11.5, weight: 400, style: 'italic', step: 14.5 },
  },
  spacing: { partnerGap: 40, siblingGap: 16, familyGap: 40, rowGap: 92, trackGap: 16 },
  line: { style: 'branch', width: 1.3, radius: 9 },
  tree: {
    wood: '#8a6a45',
    bark: '#6b4f2f',
    canopy: ['#aab87f', '#c3cd98', '#d9dfb6'],
    leaves: ['#5f7d3e', '#7a9650', '#93ab63', '#aebf7c'],
    bloom: ['#c97b8a', '#d9b15a'],
    opacity: 1,
    lines: true,
  },
  unionFont: { family: SERIF, size: 11.5, style: 'italic' },
  generationFont: { family: SMALL_CAPS, size: 13, weight: 500, letterSpacing: 0.06 },
  margin: 0.05,
  fonts: ["600 16px 'Alegreya Variable'", "italic 400 16px 'Alegreya Variable'", "500 16px 'Alegreya SC'", "700 16px 'Alegreya Sans'"],

  background(c) {
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
      el('rect', { x: f.outer.x, y: f.outer.y, width: f.outer.w, height: f.outer.h, fill: 'none', stroke: palette.accent, 'stroke-width': c.page.u * 0.26 }) +
      el('rect', { x: f.inner.x, y: f.inner.y, width: f.inner.w, height: f.inner.h, fill: 'none', stroke: palette.accent, 'stroke-width': c.page.u * 0.08 })
    );
  },

  header(c): PageBlock {
    const u = c.page.u;
    const titleFont: FontSpec = { family: SMALL_CAPS, size: u * 4.2, weight: 500, letterSpacing: 0.14 };
    const wingFont: FontSpec = { family: SERIF, size: u * 1.5, style: 'italic' };
    // Under the title only the divider; what was under it is now on the wings.
    const height = u * 1.4 + titleFont.size * 1.1 + u * 3.4;
    const drawn = c.language.drawn(c.now);
    const years = c.years ? yearSpan(c.years.from, c.years.to) : '';
    return {
      height,
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

  footer(c): PageBlock {
    const u = c.page.u;
    const legend = legendItems(c);
    const below = c.legendAt === 'below' && legend.length > 0;
    // The families' shields in rows across the foot of the page, unless they are in a column beside the tree.
    const rows = below ? wrapRows(legend, c.page.w - c.page.margin * 2, LEGEND_GAP * u) : [];
    const height = u * 1.2 + rows.length * LEGEND_ROW * u;
    return {
      height,
      draw(r: Rect) {
        let out = '';
        rows.forEach((row, i) => {
          const total = row.reduce((s, it) => s + it.w, 0) + LEGEND_GAP * u * (row.length - 1);
          let x = r.x + (r.w - total) / 2;
          const y = r.y + u * 0.6 + (i + 0.5) * LEGEND_ROW * u;
          for (const it of row) {
            out += legendEntry(c, it, x, y);
            x += it.w + LEGEND_GAP * u;
          }
        });
        return out;
      },
    };
  },

  side(c, height) {
    const u = c.page.u;
    const legend = legendItems(c);
    if (!legend.length) return undefined;
    // A column (or a few) of shields beside the tree, standing on the foot of the chart area.
    const perColumn = Math.max(1, Math.floor((height - u) / (LEGEND_ROW * u)));
    const columns: LegendItem[][] = [];
    for (let i = 0; i < legend.length; i += perColumn) columns.push(legend.slice(i, i + perColumn));
    const widths = columns.map((col) => Math.max(...col.map((it) => it.w)));
    const lead = u * 3;
    const width = lead + widths.reduce((s, w) => s + w, 0) + LEGEND_GAP * u * (columns.length - 1);
    return {
      width,
      draw(r: Rect) {
        let out = '';
        let x = r.x + lead;
        columns.forEach((col, i) => {
          const top = r.y + r.h - col.length * LEGEND_ROW * u;
          col.forEach((it, j) => (out += legendEntry(c, it, x, top + (j + 0.5) * LEGEND_ROW * u)));
          x += widths[i] + LEGEND_GAP * u;
        });
        return out;
      },
    };
  },

  overlay(c) {
    const f = frame(c).inner;
    const u = c.page.u;
    const s = u * 5.2;
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

  cardShape(c, card: LayoutCard, look: CardLook) {
    const focus = look.focus;
    const k = 5;
    const plate = (inset: number) => {
      const w = card.w - inset * 2;
      const h = card.h - inset * 2;
      const kk = Math.max(1, k - inset * 0.6);
      return `M${n(inset + kk)},${n(inset)}H${n(inset + w - kk)}L${n(inset + w)},${n(inset + kk)}V${n(inset + h - kk)}L${n(inset + w - kk)},${n(inset + h)}H${n(inset + kk)}L${n(inset)},${n(inset + h - kk)}V${n(inset + kk)}Z`;
    };
    return (
      el('path', {
        d: plate(0),
        fill: look.fill,
        stroke: focus ? palette.accent : palette.cardEdge,
        'stroke-width': focus ? 1.5 : 0.9,
        'stroke-dasharray': look.unknown ? UNKNOWN_DASH : undefined,
      }) +
      // Someone whose name nobody knows has no inner rule, only the dashed edge.
      (look.unknown ? '' : el('path', { d: plate(3), fill: 'none', stroke: palette.cardEdge, 'stroke-width': 0.4, opacity: 0.85 }))
    );
  },

  unionMarker(c: PosterContext, u: LayoutUnion, x: number, y: number) {
    // Gold rings on a vellum oval; a couple who broke up have them apart, cut with oxblood for a divorce.
    const mark = unionMark(u.kind, c.status(u.familyId), 4.8);
    if (mark.kind === 'marriage') mark.plate = { ...mark.plate, x: mark.plate.x - 0.6, w: mark.plate.w + 1.2 };
    return drawMark(mark, x, y, { plate: palette.paper, ring: GOLD, ringApart: palette.faint, ringWidth: 1.45, dot: palette.line, cut: palette.break });
  },

  focus(c, r) {
    return (
      el('rect', { x: r.x - 4, y: r.y - 4, width: r.w + 8, height: r.h + 8, rx: 5, fill: 'none', stroke: GOLD, 'stroke-width': 0.6 }) +
      el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 3, fill: 'none', stroke: GOLD, 'stroke-width': 1.5 }) +
      `<g transform="translate(${n(r.x + r.w / 2)},${n(r.y - 4)})">${el('path', { d: 'M0,-6L5,0L0,6L-5,0Z', fill: GOLD })}${el('path', { d: 'M-16,0H-8M8,0H16', stroke: GOLD, 'stroke-width': 0.9 })}</g>`
    );
  },

  generationLabel(c, label, x, y) {
    return (
      el('circle', { cx: x, cy: y, r: 14, fill: 'none', stroke: palette.accent, 'stroke-width': 0.8 }) +
      el('circle', { cx: x, cy: y, r: 11.5, fill: 'none', stroke: palette.accent, 'stroke-width': 0.35 }) +
      el(
        'text',
        { x, y: y + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...fontAttrs(heirloom.generationFont), fill: palette.accent },
        text(label),
      )
    );
  },
};

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

/** Space between legend entries side by side, and the height of a row of them, in page units (u). */
const LEGEND_GAP = 2.2;
const LEGEND_ROW = 2.4;

interface LegendItem {
  l: LegendEntry;
  /** Shield and label together. */
  w: number;
}

const legendFont = (u: number): FontSpec => ({ family: SMALL_CAPS, size: u * 1.25, weight: 500, letterSpacing: 0.04 });

/** The families for the legend; the "other families" entry only next to real ones. */
function legendItems(c: PosterContext): LegendItem[] {
  const u = c.page.u;
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
  const u = c.page.u;
  const shieldW = u * 1.3;
  const font = legendFont(u);
  const t = c.theme.tinctures[l.tincture];
  return (
    `<g transform="translate(${n(x)},${n(y - shieldW * 0.62)})">${el('path', { d: shieldPath(shieldW, shieldW * 1.18), fill: t.fill, stroke: t.edge, 'stroke-width': t.edge ? 0.6 : undefined })}</g>` +
    el('text', { x: x + shieldW + u * 0.6, y: y + font.size * 0.32, ...fontAttrs(font), fill: palette.muted }, text(l.label))
  );
}
