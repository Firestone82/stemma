/**
 * Heraldic: a roll of arms. Name plates with a band in the family colour,
 * tied together with twisted cord, a quartered shield in the family colours
 * over the title, gold rings for marriages and pennants for the generations,
 * all on aged parchment in a blue and gold frame.
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
  cardMale: '#e4e9ee',
  cardFemale: '#f3e2dc',
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
    const titleFont: FontSpec = { family: SMALL_CAPS, size: u * 3.6, weight: 500, letterSpacing: 0.1 };
    const subFont: FontSpec = { family: SERIF, size: u * 1.5, style: 'italic' };
    const shieldH = u * 8.2;
    const height = shieldH + u * 1.2 + titleFont.size * 1.1 + (c.subtitle ? u * 0.6 + subFont.size : 0) + u * 2.4;
    return {
      height,
      draw(r: Rect) {
        const cx = r.x + r.w / 2;
        const shieldW = shieldH / 1.18;
        let out = achievement(c, cx, r.y, shieldW, shieldH, u);
        const maxText = r.w * 0.8;
        const tw = c.measure(c.title, titleFont);
        const font = tw > maxText ? { ...titleFont, size: (titleFont.size * maxText) / tw } : titleFont;
        const ty = r.y + shieldH + u * 1.2 + font.size * 0.85;
        out += el('text', { x: cx, y: ty, 'text-anchor': 'middle', ...fontAttrs(font), fill: palette.accent }, text(c.title));
        const half = Math.min(tw, maxText) / 2 + u * 2;
        out += rule(cx - half, ty - font.size * 0.32, -1, u);
        out += rule(cx + half, ty - font.size * 0.32, 1, u);
        if (c.subtitle) {
          out += el('text', { x: cx, y: ty + u * 0.6 + subFont.size, 'text-anchor': 'middle', ...fontAttrs(subFont), fill: palette.muted }, text(c.subtitle));
        }
        return out;
      },
    };
  },

  footer(c): PageBlock {
    const u = c.page.u;
    const legendFont: FontSpec = { family: SMALL_CAPS, size: u * 1.25, weight: 500, letterSpacing: 0.05 };
    const capFont: FontSpec = { family: SERIF, size: u * 1.1, style: 'italic' };
    const legend = c.legend.filter((l) => l.key !== '' || c.legend.length > 1);
    // One row: the families' shields along it, and when and what years the tree was drawn at its right end.
    const height = u * 3.6;
    return {
      height,
      draw(r: Rect) {
        let out = '';
        const y = r.y + u * 1.8;
        const caption = [c.language.drawn(c.now), c.years ? yearSpan(c.years.from, c.years.to) : ''].filter(Boolean).join(', ');
        const capW = caption ? c.measure(caption, capFont) : 0;
        if (legend.length) {
          const shieldW = u * 1.5;
          const gap = u * 2.4;
          const room = r.w - (capW ? capW + gap * 1.5 : 0);
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
        if (caption)
          out += el('text', { x: r.x + r.w, y: y + capFont.size * 0.32, 'text-anchor': 'end', ...fontAttrs(capFont), fill: palette.faint }, text(caption));
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
      // A band in the family colour along the top, like the chief of a shield.
      el('path', { d: `M${k + 2.5},2.5H${n(w - k - 2.5)}L${n(w - 2.5)},${k + 2.5}V${n(k + 4.5)}H2.5V${k + 2.5}Z`, fill: band, opacity: 0.9 }) +
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

/**
 * The shield over the title, quartered in the colours of the biggest
 * families on the page, with mantling (scrolling leaves) either side and a
 * helm's torse of cord along its top.
 */
function achievement(c: PosterContext, cx: number, top: number, w: number, h: number, u: number): string {
  const tinctures = c.legend
    .filter((l) => l.key !== '')
    .slice(0, 4)
    .map((l) => c.theme.tinctures[l.tincture].fill);
  const fills = tinctures.length ? tinctures : [c.theme.tinctures.azure.fill];
  const x = cx - w / 2;
  const id = 'pp-hr-shield';
  c.def(id, `<clipPath id="${id}"><path d="${shieldPath(w, h)}"/></clipPath>`);
  let out = `<g transform="translate(${n(x)},${n(top)})">`;
  // Quarters: one colour fills the whole, two are parted per pale, three or four are quarterly.
  const quarters: { x: number; y: number; w: number; h: number; fill: string }[] = [];
  if (fills.length === 1) quarters.push({ x: 0, y: 0, w, h, fill: fills[0] });
  else if (fills.length === 2) quarters.push({ x: 0, y: 0, w: w / 2, h, fill: fills[0] }, { x: w / 2, y: 0, w: w / 2, h, fill: fills[1] });
  else {
    const f = fills.length === 3 ? [fills[0], fills[1], fills[2], fills[0]] : fills;
    quarters.push(
      { x: 0, y: 0, w: w / 2, h: h / 2, fill: f[0] },
      { x: w / 2, y: 0, w: w / 2, h: h / 2, fill: f[1] },
      { x: 0, y: h / 2, w: w / 2, h: h / 2, fill: f[2] },
      { x: w / 2, y: h / 2, w: w / 2, h: h / 2, fill: f[3] },
    );
  }
  out += `<g clip-path="url(#${id})">`;
  for (const q of quarters) out += el('rect', { x: q.x, y: q.y, width: q.w, height: q.h, fill: q.fill });
  if (quarters.length > 1) {
    out += el('path', { d: `M${n(w / 2)},0V${n(h)}`, stroke: GOLD, 'stroke-width': u * 0.14 });
    if (quarters.length === 4) out += el('path', { d: `M0,${n(h / 2)}H${n(w)}`, stroke: GOLD, 'stroke-width': u * 0.14 });
  }
  // A sheen across the top left.
  out += el('path', { d: `M0,0H${n(w * 0.55)}L0,${n(h * 0.5)}Z`, fill: '#ffffff', opacity: 0.08 });
  out += '</g>';
  out += el('path', { d: shieldPath(w, h), fill: 'none', stroke: GOLD, 'stroke-width': u * 0.22 });
  out += el('path', { d: shieldPath(w, h), fill: 'none', stroke: GOLD_DARK, 'stroke-width': u * 0.06 });
  // The torse: a twist of cord across the top of the shield.
  out += cord(`M${n(-u * 0.4)},${n(-u * 0.25)}H${n(w + u * 0.4)}`);
  out += '</g>';
  // Mantling: scrolls of leaves either side, in the first two colours.
  out += mantling(cx - w / 2 - u * 0.3, top + h * 0.12, -1, h, fills[0], fills[1] ?? GOLD);
  out += mantling(cx + w / 2 + u * 0.3, top + h * 0.12, 1, h, fills[0], fills[1] ?? GOLD);
  return out;
}

/** A scroll of mantling beside the shield: two curling strokes in the family colours, lined with gold. */
function mantling(x: number, y: number, dir: number, h: number, a: string, b: string): string {
  const s = h / 100;
  const flip = `translate(${n(x)},${n(y)}) scale(${dir * s},${s})`;
  const stroke = { fill: 'none', 'stroke-linecap': 'round' as const, 'stroke-linejoin': 'round' as const };
  return (
    `<g transform="${flip}">` +
    el('path', { d: 'M0,0C18,-4 34,8 32,26C30,42 12,44 10,58C8,72 26,80 38,70', ...stroke, stroke: a, 'stroke-width': 9 }) +
    el('path', { d: 'M0,0C18,-4 34,8 32,26C30,42 12,44 10,58C8,72 26,80 38,70', ...stroke, stroke: GOLD, 'stroke-width': 2.2 }) +
    el('path', { d: 'M2,14C16,18 24,34 16,48C10,58 20,70 30,66', ...stroke, stroke: b, 'stroke-width': 5 }) +
    el('path', { d: 'M2,14C16,18 24,34 16,48C10,58 20,70 30,66', ...stroke, stroke: GOLD, 'stroke-width': 1.3 }) +
    el('path', { d: 'M40,70C44,80 38,90 30,92', ...stroke, stroke: a, 'stroke-width': 6 }) +
    el('path', { d: 'M40,70C44,80 38,90 30,92', ...stroke, stroke: GOLD, 'stroke-width': 1.5 }) +
    `</g>`
  );
}

/** A rule beside the title, ending in a lozenge and a dot. */
function rule(x: number, y: number, dir: number, u: number): string {
  const len = u * 9;
  const end = x + dir * len;
  return (
    el('path', { d: `M${n(x)},${n(y)}H${n(end)}`, stroke: GOLD, 'stroke-width': u * 0.1, 'stroke-linecap': 'round' }) +
    el('path', {
      d: `M${n(end)},${n(y - u * 0.6)}L${n(end + dir * u * 0.6)},${n(y)}L${n(end)},${n(y + u * 0.6)}L${n(end - dir * u * 0.6)},${n(y)}Z`,
      fill: palette.accent,
    }) +
    el('circle', { cx: end + dir * u * 1.3, cy: y, r: u * 0.2, fill: GOLD })
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
