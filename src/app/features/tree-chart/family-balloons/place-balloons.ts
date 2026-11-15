/**
 * Where the balloons of the family view go (see core/model/family-view): a
 * small rounded label tied to the card or couple it belongs to by a short
 * dashed string. Parents float above the person, children hang below the
 * couple, a partner sits beside the person; when that place is taken by a
 * card or another balloon, the next free side is used.
 */
import { LayoutBounds, LayoutCard, LayoutResult, Pt } from '../../../core/layout/layout-types';
import { FamilyBalloon } from '../../../core/model/family-view';

export interface BalloonText {
  /** The names on the balloon: "Ashworth, Moreau" or "Ashworth +2". */
  text: string;
  /** Width of the text in pixels. */
  width: number;
  /** Colours of the shields on the balloon, one per family shown on it (at most 3). */
  shields: string[];
}

export interface PlacedBalloon {
  balloon: FamilyBalloon;
  /** Top-left corner and size of the balloon. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The string from the card to the balloon. */
  from: Pt;
  to: Pt;
  text: string;
  shields: string[];
}

export const BALLOON_H = 24;
/** Length of the string between a card and its balloon. */
const STRING = 16;
const PAD_LEFT = 8;
const PAD_RIGHT = 11;
const SHIELD_W = 10;
const SHIELD_GAP = 3;
/** Room kept around cards and balloons. */
const CLEAR = 4;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Side = 'above' | 'below' | 'left' | 'right';

const SIDES: Record<FamilyBalloon['kind'], Side[]> = {
  parents: ['above', 'left', 'right', 'below'],
  children: ['below', 'right', 'left', 'above'],
  partner: ['right', 'left', 'below', 'above'],
};

export function balloonWidth(t: BalloonText): number {
  return Math.round(PAD_LEFT + t.shields.length * (SHIELD_W + SHIELD_GAP) + t.width + PAD_RIGHT);
}

/**
 * Places the balloons on a layout. `partnersOf` gives a family's partners;
 * balloons whose card is not on the layout (in the middle of a change) are
 * left out.
 */
export function placeBalloons(
  layout: LayoutResult,
  balloons: readonly FamilyBalloon[],
  textOf: (b: FamilyBalloon) => BalloonText,
  partnersOf: (familyId: string) => readonly string[],
): PlacedBalloon[] {
  const cards = new Map(layout.cards.map((c) => [c.personId, c]));
  const taken: Rect[] = [
    ...layout.cards.map((c) => grow(c, CLEAR)),
    ...layout.placeholders.map((p) => grow({ x: p.cx - p.w / 2, y: p.cy - p.h / 2, w: p.w, h: p.h }, CLEAR)),
  ];
  const out: PlacedBalloon[] = [];
  // Parents first, then children, then partners: the commonest keep their best place.
  const order: FamilyBalloon['kind'][] = ['parents', 'children', 'partner'];
  const sorted = [...balloons].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const b of sorted) {
    const anchor = anchorOf(layout, cards, b, partnersOf);
    if (!anchor) continue;
    const t = textOf(b);
    const w = balloonWidth(t);
    let best: PlacedBalloon | undefined;
    for (const side of SIDES[b.kind]) {
      const placed = at(anchor, side, w, b, t);
      best ??= placed;
      if (!taken.some((r) => overlaps(r, placed))) {
        best = placed;
        break;
      }
    }
    out.push(best!);
    taken.push(grow(best!, CLEAR));
  }
  return out;
}

/** The layout's bounds with the balloons in them. */
export function boundsWithBalloons(bounds: LayoutBounds, placed: readonly PlacedBalloon[]): LayoutBounds {
  if (!placed.length) return bounds;
  let x0 = bounds.x;
  let y0 = bounds.y;
  let x1 = bounds.x + bounds.w;
  let y1 = bounds.y + bounds.h;
  for (const p of placed) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + p.w);
    y1 = Math.max(y1, p.y + p.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

interface Anchor extends Rect {
  /** Where strings above and below leave from. */
  cx: number;
  /** A line to children on the chart runs down from `cx`: a balloon below branches off it to the right. */
  stem?: boolean;
}

/** What a balloon is tied to: a card, or for children the couple's cards and the marker between them. */
function anchorOf(
  layout: LayoutResult,
  cards: ReadonlyMap<string, LayoutCard>,
  b: FamilyBalloon,
  partnersOf: (familyId: string) => readonly string[],
): Anchor | undefined {
  const card = cards.get(b.personId);
  if (!card) return undefined;
  if (b.kind !== 'children' || !b.familyId) return { ...card, cx: card.x + card.w / 2 };
  const shown = partnersOf(b.familyId)
    .map((id) => cards.get(id))
    .filter((c): c is LayoutCard => !!c);
  const box = shown.length > 1 && shown.every((c) => c.rank === card.rank) ? union(shown) : card;
  const marker = layout.unions.find((u) => u.familyId === b.familyId);
  const sideBySide = marker && (marker.mode === 'gap' || marker.mode === 'bridge');
  const stem = layout.connectors.some((c) => c.familyId === b.familyId && c.drops.length > 0);
  return { ...box, cx: sideBySide ? marker.cx : stem && marker ? marker.cx : box.x + box.w / 2, stem };
}

function at(a: Anchor, side: Side, w: number, balloon: FamilyBalloon, t: BalloonText): PlacedBalloon {
  const h = BALLOON_H;
  const cy = a.y + a.h / 2;
  let x: number;
  let y: number;
  let from: Pt;
  let to: Pt;
  switch (side) {
    case 'above':
      x = a.cx - w / 2;
      y = a.y - STRING - h;
      from = { x: a.cx, y: a.y };
      to = { x: a.cx, y: y + h };
      break;
    case 'below':
      if (a.stem) {
        // Off the line down to the children already on the chart.
        x = a.cx + STRING;
        y = a.y + a.h + 6;
        from = { x: a.cx, y: y + h / 2 };
        to = { x, y: y + h / 2 };
      } else {
        x = a.cx - w / 2;
        y = a.y + a.h + STRING;
        from = { x: a.cx, y: a.y + a.h };
        to = { x: a.cx, y };
      }
      break;
    case 'left':
      x = a.x - STRING - w;
      y = cy - h / 2;
      from = { x: a.x, y: cy };
      to = { x: x + w, y: cy };
      break;
    case 'right':
      x = a.x + a.w + STRING;
      y = cy - h / 2;
      from = { x: a.x + a.w, y: cy };
      to = { x, y: cy };
      break;
  }
  return { balloon, x, y, w, h, from, to, text: t.text, shields: t.shields };
}

function union(rects: readonly Rect[]): Rect {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
