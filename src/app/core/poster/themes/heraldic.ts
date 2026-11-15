/**
 * Heraldic: a roll of arms. Name plates with a band in the family colour,
 * tied together with twisted cord, the title between gold rules with the
 * generations and people on one side and when it was drawn on the other,
 * gold rings for marriages and pennants for the generations, all on aged
 * parchment in a blue and gold frame.
 */
import { LayoutCard, LayoutUnion } from '../../layout/layout-types';
import { yearSpan } from '../../lang/language';
import { connectorPaths, roundedPath, unionLinePath } from '../../layout/paths';
import { unionMark } from '../../layout/union-marks';
import { drawMark } from '../marks';
import { CardLook, FontSpec, PageBlock, PosterContext, PosterTheme, Rect, UNKNOWN_DASH } from '../poster-types';
import { el, fontAttrs, n, shieldPath, specklePattern, text } from '../svg';
import { SANS, SERIF, SMALL_CAPS } from './fonts';

const PARCHMENT_LIGHT = '#f4ead4';
const GOLD = '#b08a3c';
const GOLD_DARK = '#8a6a26';
const CORD = '#6a4d2a';
const CORD_LIGHT = '#c2a06a';
const CORD_SHINE = '#eadbb6';

const palette = {
  paper: '#e6dabe',
  ink: '#241b12',
  muted: '#55432f',
  faint: '#7f6a51',
  line: CORD,
  accent: '#1f3d63',
  card: PARCHMENT_LIGHT,
  cardEdge: '#6b5438',
  kin: '#1f3d63',
  cardMale: '#eeeade',
  cardFemale: '#f4e7d7',
  male: '#2a4a74',
  female: '#8a2f46',
  break: '#9c2f22',
};

export const heraldic: PosterTheme = {
  id: 'heraldic',
  name: 'Heraldic',
  description: 'A roll of arms: name plates in the family colours, tied together with cord.',
  flow: 'down',
  palette,
  swatch: [palette.paper, palette.accent, GOLD],
  tinctures: {
    azure: { fill: '#2a4a74', ink: PARCHMENT_LIGHT },
    gules: { fill: '#8f2b2b', ink: PARCHMENT_LIGHT },
    vert: { fill: '#2f5f3e', ink: PARCHMENT_LIGHT },
    purpure: { fill: '#5b3f72', ink: PARCHMENT_LIGHT },
    or: { fill: '#c0962f', ink: '#241b12' },
    tenne: { fill: '#a65a27', ink: PARCHMENT_LIGHT },
    sanguine: { fill: '#7a2a3e', ink: PARCHMENT_LIGHT },
    celeste: { fill: '#4a7a98', ink: PARCHMENT_LIGHT },
    sable: { fill: '#2f2a26', ink: PARCHMENT_LIGHT },
    teal: { fill: '#2b6a63', ink: PARCHMENT_LIGHT },
    rose: { fill: '#a85570', ink: PARCHMENT_LIGHT },
    olive: { fill: '#6c6a25', ink: PARCHMENT_LIGHT },
    cendree: { fill: '#857e72', ink: PARCHMENT_LIGHT },
    brunatre: { fill: '#62402a', ink: PARCHMENT_LIGHT },
    argent: { fill: '#f1e9d6', ink: '#55432f', edge: '#8a7352' },
  },
  card: {
    width: 178,
    radius: 0,
    textX: 52,
    padRight: 12,
    top: 13,
    bottom: 12,
    badge: { kind: 'shield', x: 14, size: 26, font: { family: SANS, size: 10.5, weight: 700, letterSpacing: 0.02 } },
    photoRadius: 16,
    kin: { family: SMALL_CAPS, size: 10.5, weight: 500, letterSpacing: 0.09, step: 0 },
    given: { family: SERIF, size: 17.5, weight: 600, step: 18 },
    surname: { family: SMALL_CAPS, size: 14.5, weight: 500, letterSpacing: 0.03, step: 17.5 },
    birth: { family: SMALL_CAPS, size: 12, weight: 500, letterSpacing: 0.02, step: 15 },
    dates: { family: SERIF, size: 12.5, weight: 400, step: 16.5 },
    place: { family: SERIF, size: 11.5, weight: 400, style: 'italic', step: 14.5 },
  },
  spacing: { partnerGap: 44, siblingGap: 16, familyGap: 40, rowGap: 80, trackGap: 16 },
  line: { style: 'square', width: 1.4, radius: 14 },
  unionFont: { family: SERIF, size: 11.5, style: 'italic' },
  generationFont: { family: SMALL_CAPS, size: 12.5, weight: 500, letterSpacing: 0.06 },
  margin: 0.055,
  fonts: ["600 16px 'Alegreya Variable'", "italic 400 16px 'Alegreya Variable'", "500 16px 'Alegreya SC'", "700 16px 'Alegreya Sans'"],

  background(c) {
    const { w, h, u } = c.page;
    c.def('pp-hr-specks', specklePattern('pp-hr-specks', 170, '#6b4b24', 90, 7, 0.8, 0.16));
    c.def(
      'pp-hr-weave',
      `<pattern id="pp-hr-weave" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,3H6" stroke="#8a7352" stroke-width="0.5" stroke-opacity="0.07"/></pattern>`,
    );
    c.def(
      'pp-hr-vignette',
      '<radialGradient id="pp-hr-vignette" cx="50%" cy="48%" r="76%"><stop offset="55%" stop-color="#a98446" stop-opacity="0"/><stop offset="100%" stop-color="#7d5f2e" stop-opacity="0.4"/></radialGradient>',
    );
    const f = frame(c);
    return (
      el('rect', { width: w, height: h, fill: palette.paper }) +
      el('rect', { width: w, height: h, fill: 'url(#pp-hr-weave)' }) +
      el('rect', { width: w, height: h, fill: 'url(#pp-hr-specks)' }) +
      el('rect', { width: w, height: h, fill: 'url(#pp-hr-vignette)' }) +
      el('rect', { x: f.outer.x, y: f.outer.y, width: f.outer.w, height: f.outer.h, fill: 'none', stroke: palette.accent, 'stroke-width': u * 0.32 }) +
      el('rect', { x: f.inner.x, y: f.inner.y, width: f.inner.w, height: f.inner.h, fill: 'none', stroke: GOLD, 'stroke-width': u * 0.1 })
    );
  },

  header(c): PageBlock {
    const u = c.page.u;
    const titleFont: FontSpec = { family: SMALL_CAPS, size: u * 3.8, weight: 500, letterSpacing: 0.1 };
    const wingFont: FontSpec = { family: SERIF, size: u * 1.5, style: 'italic' };
    // As on the Heirloom print: the title in the middle between rules, how many generations and people
    // on the left, when it was drawn and the years it spans on the right.
    const height = u * 1.4 + titleFont.size * 1.1 + u * 2.2;
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
        const half = Math.min(tw, maxText) / 2 + u * 2.4;
        const longest = Math.max(c.subtitle ? c.measure(c.subtitle, wingFont) : 0, c.measure(drawn, wingFont), years ? c.measure(years, wingFont) : 0);
        const reach = Math.min(r.w * 0.47, half + Math.max(u * 24, longest + u * 7));
        const ry = ty - font.size * 0.34;
        out += rule(cx - half, cx - reach, ry, u);
        out += rule(cx + half, cx + reach, ry, u);
        const wing = reach - half - u * 3.5;
        const wingText = (s: string, side: -1 | 1, below: boolean) => {
          if (!s) return '';
          const w = c.measure(s, wingFont);
          const f = w > wing ? { ...wingFont, size: (wingFont.size * wing) / w } : wingFont;
          const y = below ? ry + u * 1.3 + f.size * 0.8 : ry - u * 0.85;
          return el('text', { x: cx + (side * (half + reach)) / 2, y, 'text-anchor': 'middle', ...fontAttrs(f), fill: palette.muted }, text(s));
        };
        out += wingText(c.subtitle, -1, false);
        out += wingText(drawn, 1, false);
        out += wingText(years, 1, true);
        return out;
      },
    };
  },

  footer(c): PageBlock {
    const u = c.page.u;
    const legendFont: FontSpec = { family: SMALL_CAPS, size: u * 1.25, weight: 500, letterSpacing: 0.05 };
    const legend = c.legend.filter((l) => l.key !== '' || c.legend.length > 1);
    // One row: the families' shields along it.
    const height = u * 3.6;
    return {
      height,
      draw(r: Rect) {
        let out = '';
        const y = r.y + u * 1.8;
        if (legend.length) {
          const shieldW = u * 1.5;
          const gap = u * 2.4;
          const room = r.w;
          const items = legend.map((l) => ({ l, w: shieldW + u * 0.7 + c.measure(l.label, legendFont) }));
          let total = items.reduce((s, i) => s + i.w, 0) + gap * (items.length - 1);
          while (total > room && items.length > 1) total -= items.pop()!.w + gap;
          let x = r.x;
          for (const { l, w } of items) {
            const t = c.theme.tinctures[l.tincture];
            out += `<g transform="translate(${n(x)},${n(y - shieldW * 0.62)})">${el('path', { d: shieldPath(shieldW, shieldW * 1.18), fill: t.fill, stroke: GOLD_DARK, 'stroke-width': 0.7 })}</g>`;
            out += el('text', { x: x + shieldW + u * 0.7, y: y + legendFont.size * 0.32, ...fontAttrs(legendFont), fill: palette.muted }, text(l.label));
            x += w + gap;
          }
        }
        return out;
      },
    };
  },

  overlay(c) {
    const f = frame(c).inner;
    const u = c.page.u;
    const s = u * 1.6;
    const rosette = (x: number, y: number) =>
      `<g transform="translate(${n(x)},${n(y)})">` +
      el('circle', { r: s * 1.1, fill: palette.paper, stroke: palette.accent, 'stroke-width': u * 0.12 }) +
      el('path', { d: quatrefoil(s * 0.72), fill: GOLD, stroke: GOLD_DARK, 'stroke-width': 0.5 }) +
      el('circle', { r: s * 0.18, fill: palette.accent }) +
      `</g>`;
    return rosette(f.x, f.y) + rosette(f.x + f.w, f.y) + rosette(f.x, f.y + f.h) + rosette(f.x + f.w, f.y + f.h);
  },

  cardShape(c, card: LayoutCard, look: CardLook) {
    const k = 6;
    const w = card.w;
    const h = card.h;
    const plate = `M${k},0H${n(w - k)}L${n(w)},${k}V${n(h - k)}L${n(w - k)},${n(h)}H${k}L0,${n(h - k)}V${k}Z`;
    const tincture = c.theme.tinctures[c.colors.get(card.personId) ?? 'argent'];
    const band = tincture.fill === c.theme.tinctures.argent.fill ? GOLD : tincture.fill;
    return (
      el('path', {
        d: plate,
        fill: look.fill,
        stroke: look.focus ? GOLD_DARK : palette.cardEdge,
        'stroke-width': look.focus ? 1.6 : 1,
        'stroke-dasharray': look.unknown ? UNKNOWN_DASH : undefined,
      }) +
      // A thin band in the family colour along the top edge, like the chief of a shield; clear of the sex symbol under it.
      el('path', { d: `M${k + 1},2.2H${n(w - k - 1)}L${n(w - k + 1.6)},4.8H${k - 1.6}Z`, fill: band, opacity: 0.9 }) +
      (look.unknown ? '' : el('path', { d: `M${k + 2.5},${n(h - 2.5)}H${n(w - k - 2.5)}`, stroke: GOLD, 'stroke-width': 0.8, opacity: 0.9 }))
    );
  },

  connectors(c) {
    const { theme, layout } = c;
    const out: string[] = [];
    for (const conn of layout.connectors) {
      for (const p of connectorPaths(conn, c.lineStyle, theme.line.radius)) {
        out.push(p.relation === 'biological' ? cord(p.d) : thread(p.d, p.relation));
      }
    }
    return out.join('');
  },

  unionMarker(c: PosterContext, u: LayoutUnion, x: number, y: number) {
    const mark = unionMark(u.kind, c.status(u.familyId), 5);
    if (mark.kind === 'marriage') mark.plate = { ...mark.plate, x: mark.plate.x - 0.8, w: mark.plate.w + 1.6 };
    return drawMark(mark, x, y, {
      plate: PARCHMENT_LIGHT,
      plateEdge: palette.cardEdge,
      ring: GOLD,
      ringApart: palette.faint,
      ringWidth: 1.6,
      dot: CORD,
      cut: palette.break,
    });
  },

  focus(c, r) {
    const cx = r.x + r.w / 2;
    return (
      el('rect', { x: r.x - 4, y: r.y - 4, width: r.w + 8, height: r.h + 8, fill: 'none', stroke: GOLD, 'stroke-width': 0.7 }) +
      el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'none', stroke: GOLD, 'stroke-width': 1.6 }) +
      `<g transform="translate(${n(cx)},${n(r.y - 5)})">${crown(9)}</g>`
    );
  },

  generationLabel(c, label, x, y) {
    // A pennant hanging from a short staff.
    const w = 30;
    const h = 20;
    return (
      `<g transform="translate(${n(x)},${n(y)})">` +
      el('path', {
        d: `M${-w / 2},${-h / 2}H${w / 2}L${w / 2 - 6},0L${w / 2},${h / 2}H${-w / 2}Z`,
        fill: palette.accent,
        stroke: GOLD_DARK,
        'stroke-width': 0.6,
      }) +
      el(
        'text',
        { x: -2, y: 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...fontAttrs(heraldic.generationFont), fill: PARCHMENT_LIGHT },
        text(label),
      ) +
      `</g>`
    );
  },
};

/** The line between partners, as cord too. Called from the renderer through `unionLine`. */
export function heraldicUnionLine(u: LayoutUnion, style: 'square' | 'curved'): string {
  const d = unionLinePath(u, style, 10);
  return d ? cord(d) : '';
}

function frame(c: PosterContext): { outer: Rect; inner: Rect } {
  const { w, h, u, margin: m } = c.page;
  const o = m * 0.4;
  const i = o + u * 0.9;
  return {
    outer: { x: o, y: o, w: w - o * 2, h: h - o * 2 },
    inner: { x: i, y: i, w: w - i * 2, h: h - i * 2 },
  };
}

/** A twisted cord along a path: a dark core, a lighter strand and the twist as dashes. */
export function cord(d: string): string {
  const base = { d, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;
  return (
    el('path', { ...base, stroke: CORD, 'stroke-width': 4.6 }) +
    el('path', { ...base, stroke: CORD_LIGHT, 'stroke-width': 3 }) +
    el('path', { ...base, stroke: CORD, 'stroke-width': 3, 'stroke-dasharray': '2.4 2.8', 'stroke-dashoffset': 0.6, opacity: 0.75 }) +
    el('path', { ...base, stroke: CORD_SHINE, 'stroke-width': 0.9, 'stroke-dasharray': '1.2 4', 'stroke-dashoffset': 2.6, opacity: 0.9 })
  );
}

/** A single thread for a child joined to a family otherwise than by birth (adopted, step, foster). */
function thread(d: string, relation: string): string {
  const dash: Record<string, string> = { adopted: '6 4', foster: '1.5 4', step: '10 4', unknown: '2 4' };
  return (
    el('path', {
      d,
      fill: 'none',
      stroke: CORD,
      'stroke-width': 2.2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-dasharray': dash[relation],
    }) +
    el('path', {
      d,
      fill: 'none',
      stroke: CORD_LIGHT,
      'stroke-width': 0.8,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-dasharray': dash[relation],
    })
  );
}

/** A double rule reaching out from the title: a lozenge at the title and a dot at the far end. */
function rule(inner: number, outer: number, y: number, u: number): string {
  const dir = outer > inner ? 1 : -1;
  const from = inner + dir * u * 1.3;
  return (
    el('path', { d: `M${n(from)},${n(y)}H${n(outer)}`, stroke: GOLD, 'stroke-width': u * 0.12, 'stroke-linecap': 'round' }) +
    el('path', { d: `M${n(from)},${n(y + u * 0.5)}H${n(outer - dir * u * 2.2)}`, stroke: GOLD, 'stroke-width': u * 0.05, 'stroke-linecap': 'round' }) +
    el('path', {
      d: `M${n(inner)},${n(y - u * 0.6)}L${n(inner + dir * u * 0.6)},${n(y)}L${n(inner)},${n(y + u * 0.6)}L${n(inner - dir * u * 0.6)},${n(y)}Z`,
      fill: palette.accent,
    }) +
    el('circle', { cx: outer, cy: y, r: u * 0.24, fill: GOLD })
  );
}

/** A four-lobed ornament around (0,0). */
function quatrefoil(r: number): string {
  const l = r * 0.55;
  return (
    `M0,${n(-r)}A${n(l)},${n(l)} 0 1,1 ${n(r)},0` +
    `A${n(l)},${n(l)} 0 1,1 0,${n(r)}` +
    `A${n(l)},${n(l)} 0 1,1 ${n(-r)},0` +
    `A${n(l)},${n(l)} 0 1,1 0,${n(-r)}Z`
  );
}

/** A small crown with three points, drawn above (0,0). */
function crown(w: number): string {
  const h = w * 0.7;
  return (
    el('path', {
      d: `M${n(-w)},0V${n(-h * 0.55)}L${n(-w * 0.5)},${n(-h * 0.2)}L0,${n(-h)}L${n(w * 0.5)},${n(-h * 0.2)}L${n(w)},${n(-h * 0.55)}V0Z`,
      fill: GOLD,
      stroke: GOLD_DARK,
      'stroke-width': 0.6,
      'stroke-linejoin': 'round',
    }) +
    el('circle', { cy: -h, r: 1, fill: GOLD_DARK }) +
    el('circle', { cx: -w, cy: -h * 0.55, r: 0.9, fill: GOLD_DARK }) +
    el('circle', { cx: w, cy: -h * 0.55, r: 0.9, fill: GOLD_DARK })
  );
}

export { roundedPath };
