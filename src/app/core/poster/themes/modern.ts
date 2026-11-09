/**
 * Modern: a clean chart on soft white. One sans-serif family, white tiles
 * with a light shadow, a square monogram in the family colour, the lines
 * between the generations coloured by family, and faint bands behind the
 * generations with their number at the side.
 */
import { LayoutCard, LayoutUnion } from '../../layout/layout-types';
import { yearSpan } from '../../lang/language';
import { connectorPaths } from '../../layout/paths';
import { unionMark } from '../../layout/union-marks';
import { drawMark } from '../marks';
import { CardLook, FontSpec, PageBlock, PosterContext, PosterTheme, Rect, UNKNOWN_DASH } from '../poster-types';
import { el, fontAttrs, mixHex, n, text } from '../svg';
import { SANS } from './fonts';

const palette = {
  paper: '#f7f6f3',
  ink: '#17191d',
  muted: '#50555d',
  faint: '#8a9098',
  line: '#5d636b',
  accent: '#1f5fd6',
  card: '#ffffff',
  cardEdge: '#e2e4e7',
  kin: '#1f5fd6',
  cardMale: '#f0f5ff',
  cardFemale: '#fff0f4',
  male: '#2f62c9',
  female: '#c8406c',
  break: '#d6453a',
};

const BAND = '#ecebe7';
const DASH: Record<string, string> = { adopted: '6 5', foster: '1.5 4.5', step: '10 5', unknown: '2 4' };

export const modern: PosterTheme = {
  id: 'modern',
  name: 'Modern',
  description: 'Soft white, tiles with a shadow and lines in the family colours.',
  flow: 'down',
  palette,
  swatch: [palette.paper, palette.ink, palette.accent],
  tinctures: {
    azure: { fill: '#2f62c9', ink: '#ffffff' },
    gules: { fill: '#d9483b', ink: '#ffffff' },
    vert: { fill: '#1f9a6a', ink: '#ffffff' },
    purpure: { fill: '#7b55d0', ink: '#ffffff' },
    or: { fill: '#e8a825', ink: '#17191d' },
    tenne: { fill: '#ea7a2c', ink: '#ffffff' },
    sanguine: { fill: '#c93d78', ink: '#ffffff' },
    celeste: { fill: '#239fc9', ink: '#ffffff' },
    sable: { fill: '#3a3f46', ink: '#ffffff' },
    teal: { fill: '#12a39a', ink: '#ffffff' },
    rose: { fill: '#f0a1bb', ink: '#3a0f1f' },
    olive: { fill: '#8f9a1e', ink: '#ffffff' },
    cendree: { fill: '#8b939c', ink: '#ffffff' },
    brunatre: { fill: '#8a5a3a', ink: '#ffffff' },
    argent: { fill: '#dfe2e6', ink: '#50555d' },
  },
  card: {
    width: 178,
    radius: 12,
    textX: 56,
    padRight: 12,
    top: 13,
    bottom: 13,
    badge: { kind: 'none', x: 13, size: 32, font: { family: SANS, size: 12, weight: 700, letterSpacing: 0.02 } },
    photoRadius: 16,
    kin: { family: SANS, size: 9.5, weight: 700, letterSpacing: 0.12, step: 0 },
    given: { family: SANS, size: 17, weight: 700, step: 18.5 },
    surname: { family: SANS, size: 13.5, weight: 400, step: 16.5 },
    birth: { family: SANS, size: 11.5, weight: 400, step: 14.5 },
    dates: { family: SANS, size: 12, weight: 400, step: 16 },
    place: { family: SANS, size: 11.5, weight: 400, step: 14.5 },
  },
  spacing: { partnerGap: 36, siblingGap: 16, familyGap: 40, rowGap: 84, trackGap: 16 },
  line: { style: 'curved', width: 2, radius: 12 },
  unionFont: { family: SANS, size: 10.5, weight: 500 },
  generationFont: { family: SANS, size: 13, weight: 700 },
  margin: 0.055,
  fonts: ["400 16px 'Alegreya Sans'", "500 16px 'Alegreya Sans'", "700 16px 'Alegreya Sans'"],

  background(c) {
    c.def(
      'pp-md-shadow',
      '<filter id="pp-md-shadow" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="2.2" flood-color="#1b2230" flood-opacity="0.13"/></filter>',
    );
    return el('rect', { width: c.page.w, height: c.page.h, fill: palette.paper });
  },

  header(c): PageBlock {
    const u = c.page.u;
    const titleFont: FontSpec = { family: SANS, size: u * 4.8, weight: 700, letterSpacing: -0.015 };
    const subFont: FontSpec = { family: SANS, size: u * 1.6, weight: 400 };
    const legendFont: FontSpec = { family: SANS, size: u * 1.2, weight: 500 };
    const height = titleFont.size * 1.05 + u * 0.9 + (c.subtitle ? subFont.size + u * 0.5 : 0) + u * 3.2;
    return {
      height,
      draw(r: Rect) {
        // The legend as chips on the right, in up to two rows; the title takes what is left.
        const chipH = legendFont.size * 1.9;
        const items = c.legend.map((l) => ({ l, w: chipH * 0.55 + u * 0.9 + c.measure(l.label, legendFont) + u * 1.1 }));
        const rowW = Math.min(
          r.w * 0.45,
          items.reduce((s, i) => s + i.w + u * 0.7, 0),
        );
        const rows: (typeof items)[] = [[]];
        let used = 0;
        for (const it of items) {
          if (used + it.w > rowW && rows[rows.length - 1].length) {
            if (rows.length === 2) break;
            rows.push([]);
            used = 0;
          }
          rows[rows.length - 1].push(it);
          used += it.w + u * 0.7;
        }
        let out = '';
        rows.forEach((row, ri) => {
          let x = r.x + r.w;
          const y = r.y + u * 0.3 + ri * (chipH + u * 0.6);
          for (const it of [...row].reverse()) {
            x -= it.w;
            const t = c.theme.tinctures[it.l.tincture];
            out += el('rect', { x, y, width: it.w, height: chipH, rx: chipH / 2, fill: '#ffffff', stroke: palette.cardEdge, 'stroke-width': u * 0.06 });
            out += el('circle', { cx: x + u * 1.1 + chipH * 0.1, cy: y + chipH / 2, r: chipH * 0.22, fill: t.fill });
            out += el(
              'text',
              { x: x + chipH * 0.55 + u * 1.3, y: y + chipH / 2 + legendFont.size * 0.35, ...fontAttrs(legendFont), fill: palette.ink },
              text(it.l.label),
            );
            x -= u * 0.7;
          }
        });
        const titleMax = r.w - (items.length ? rowW + u * 4 : 0);
        out += el('rect', { x: r.x, y: r.y + u * 0.4, width: u * 0.7, height: titleFont.size * 0.78, rx: u * 0.2, fill: palette.accent });
        const tx = r.x + u * 1.9;
        out += el('text', { x: tx, y: r.y + titleFont.size * 0.82, ...fontAttrs(titleFont), fill: palette.ink }, text(c.fit(c.title, titleFont, titleMax)));
        if (c.subtitle) {
          out += el(
            'text',
            { x: tx, y: r.y + titleFont.size * 1.05 + u * 0.9 + subFont.size * 0.8, ...fontAttrs(subFont), fill: palette.muted },
            text(c.fit(c.subtitle, subFont, titleMax)),
          );
        }
        return out;
      },
    };
  },

  footer(c): PageBlock {
    const u = c.page.u;
    const font: FontSpec = { family: SANS, size: u * 1.15 };
    return {
      height: u * 3,
      draw(r: Rect) {
        const y = r.y + r.h - u * 0.4;
        let out = el('path', { d: `M${n(r.x)},${n(r.y + u * 0.6)}H${n(r.x + r.w)}`, stroke: palette.cardEdge, 'stroke-width': u * 0.1 });
        out += el('text', { x: r.x, y, ...fontAttrs(font), fill: palette.faint }, text(c.language.drawn(c.now)));
        if (c.years)
          out += el('text', { x: r.x + r.w, y, 'text-anchor': 'end', ...fontAttrs(font), fill: palette.faint }, text(yearSpan(c.years.from, c.years.to)));
        return out;
      },
    };
  },

  cardShape(c, card: LayoutCard, look: CardLook) {
    const r = modern.card.radius;
    const tincture = c.theme.tinctures[c.colors.get(card.personId) ?? 'argent'];
    const b = c.card.badge;
    const t = c.texts.get(card.personId);
    const person = c.person(card.personId);
    // A monogram in the family colour, square or round as the portraits are (a photo takes its place).
    const top = c.settings.portraitAlign === 'top' ? Math.min(c.card.top, (card.h - b.size) / 2) : (card.h - b.size) / 2;
    const monogram =
      person?.photo && c.settings.showPhotos
        ? ''
        : `<g transform="translate(${n(b.x)},${n(top)})">` +
          el('rect', { width: b.size, height: b.size, rx: c.settings.portrait === 'round' ? b.size / 2 : b.size * 0.3, fill: tincture.fill }) +
          el(
            'text',
            { x: b.size / 2, y: b.size / 2 + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...fontAttrs(b.font), fill: tincture.ink },
            text(t?.initials ?? ''),
          ) +
          `</g>`;
    return (
      el('rect', {
        x: 0,
        y: 0,
        width: card.w,
        height: card.h,
        rx: r,
        fill: look.fill,
        stroke: look.focus ? palette.accent : look.unknown ? palette.faint : 'none',
        'stroke-width': look.focus ? 2 : 1,
        'stroke-dasharray': look.unknown ? UNKNOWN_DASH : undefined,
        filter: look.unknown ? undefined : 'url(#pp-md-shadow)',
      }) + monogram
    );
  },

  connectors(c) {
    const { layout } = c;
    const out: string[] = [];
    for (const conn of layout.connectors) {
      const family = c.index.family(conn.familyId);
      // Lines in the colour of the family they come from: the first partner's, as the children usually bear that name.
      const tincture = family?.partners.map((id) => c.colors.get(id)).find((x) => !!x);
      const color = tincture ? mixHex(c.theme.tinctures[tincture].fill, palette.paper, 0.15) : palette.line;
      for (const p of connectorPaths(conn, c.lineStyle, modern.line.radius)) {
        out.push(
          el('path', {
            d: p.d,
            fill: 'none',
            stroke: color,
            'stroke-width': modern.line.width,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'stroke-dasharray': DASH[p.relation],
          }),
        );
      }
    }
    return out.join('');
  },

  unionLine(c, u, d) {
    void c;
    void u;
    return el('path', { d, fill: 'none', stroke: palette.line, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.7 });
  },

  unionMarker(c: PosterContext, u: LayoutUnion, x: number, y: number) {
    const status = c.status(u.familyId);
    const mark = unionMark(u.kind, status, 3.8);
    // A couple who broke up: two hollow rings apart, with a red cut for a divorce.
    if (mark.apart) return drawMark(mark, x, y, { plate: palette.paper, ring: palette.muted, ringWidth: 1.3, dot: palette.faint, cut: palette.break });
    let inner: string;
    if (u.kind === 'marriage') inner = el('circle', { r: 4.6, fill: palette.ink });
    else if (status === 'engaged' || u.kind === 'partnership') inner = el('circle', { r: 4.2, fill: palette.paper, stroke: palette.ink, 'stroke-width': 1.6 });
    else inner = el('circle', { r: 2.8, fill: palette.faint });
    return `<g transform="translate(${n(x)},${n(y)})">${inner}</g>`;
  },

  focus(c, r) {
    return el('rect', { x: r.x - 3, y: r.y - 3, width: r.w + 6, height: r.h + 6, rx: 16, fill: mixHex(palette.accent, palette.paper, 0.9), stroke: 'none' });
  },

  generationLabel(c, label, x, y, index) {
    void label;
    // A faint band behind every other generation, with its number at the side.
    const row = c.layout.rows[index];
    const b = c.layout.bounds;
    const pad = 14;
    const band =
      row && index % 2 === 0
        ? el('rect', { x: x - 24, y: row.top - pad, width: b.x + b.w + 24 - (x - 24), height: row.bottom - row.top + pad * 2, rx: 6, fill: BAND })
        : '';
    return (
      band +
      el(
        'text',
        {
          x,
          y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          ...fontAttrs({ family: SANS, size: 22, weight: 700 }),
          fill: mixHex(palette.accent, palette.paper, 0.55),
        },
        text(String(index + 1)),
      )
    );
  },
};
