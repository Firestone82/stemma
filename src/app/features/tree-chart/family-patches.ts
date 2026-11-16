/** A card's place on the chart, as far as the families' backgrounds need it. */
export interface PatchCard {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far apart cards of a row may stand and still be one box: the widest gap the layout leaves between cards standing together. */
const ROW_GAP = 48;
/** How far apart rows of one family may be, one over the other, and still be joined into one patch. */
const COLUMN_GAP = 72;
/** A family unit is filled out to the box round it only where that box is at most this many times its own boxes. */
const FILL_RATIO = 2.6;

/**
 * The background of one family's cards on the chart (ViewSettings.familyBackgrounds), as plain boxes: the cards
 * that stand next to each other in a row are one box round all of them; boxes that stand one over the other,
 * near enough, are joined by a box over what they have in common across; and so are cards in a column. Every
 * box is `pad` bigger than the cards it is round. Drawn together, a family that stands together is one patch.
 */
export function familyPatches(cards: readonly PatchCard[], pad: number): Box[] {
  // Rows: cards at one height, next to each other.
  const rows: Box[] = [];
  const sorted = [...cards].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const c of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - c.y) < 1 && Math.abs(last.h - c.h) < 1 && c.x - (last.x + last.w) <= ROW_GAP) {
      last.w = Math.max(last.w, c.x + c.w - last.x);
    } else rows.push({ x: c.x, y: c.y, w: c.w, h: c.h });
  }
  const out = rows.map((r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 }));
  // Bridges between rows, one over the other: as wide as what the two have in common across, the full gap high.
  for (const a of rows)
    for (const b of rows) {
      const gap = b.y - (a.y + a.h);
      if (gap <= 0 || gap > COLUMN_GAP) continue;
      const left = Math.max(a.x, b.x);
      const right = Math.min(a.x + a.w, b.x + b.w);
      if (right - left < 1) continue;
      // Only the nearest row under a row: nothing of another row of the family in between.
      const between = rows.some((r) => r !== a && r !== b && r.y > a.y + a.h - 1 && r.y + r.h < b.y + 1 && r.x < right && r.x + r.w > left);
      if (between) continue;
      out.push({ x: left - pad, y: a.y + a.h, w: right - left + pad * 2, h: gap });
    }
  return out;
}

/** A family's background on the chart: its boxes, and where it shares them with other families, striped. */
export interface FamilyPatch {
  tincture: string;
  boxes: Box[];
  /**
   * The boxes of other families that overlap this one's, and which half of the stripes this family gives up
   * there ('a' or 'b'; the other family gives up the other half): where two families' backgrounds overlap they
   * stand in stripes side by side, half and half, instead of one over the other.
   */
  cuts: { box: Box; stripe: 'a' | 'b' }[];
  /**
   * The box round each unit of the family (parents and their own children, see `links`): filled too, so a
   * family has no gaps or notches in it. Each only where nothing of another family is (`others`): neither its
   * boxes, nor its filled box where that is the smaller of the two. Nothing is ever filled twice over.
   */
  fills: { box: Box; others: Box[] }[];
}

/**
 * The backgrounds of all families on the chart. A card is in its own family's background, and in that of
 * each partner it is married to or lives with: a couple stands in one box. A card in two families' backgrounds
 * (a woman born into one family, married into another) is striped in both colours.
 *
 * @param families The families each card is in, by its index in `cards`; those of no family are in none.
 * @param links Cards joined by a line, by their indices (a child and its parent): two of one family make
 *   one patch of that family, however far apart they stand.
 */
export function familyBackgrounds(
  cards: readonly PatchCard[],
  families: readonly (readonly string[])[],
  pad: number,
  links: readonly (readonly [number, number])[] = [],
): FamilyPatch[] {
  const by = new Map<string, PatchCard[]>();
  cards.forEach((c, i) => {
    for (const t of families[i] ?? []) {
      const list = by.get(t) ?? [];
      list.push(c);
      by.set(t, list);
    }
  });
  const order = [...by.keys()];
  const patches = order.map((tincture) => ({ tincture, boxes: familyPatches(by.get(tincture)!, pad) }));
  const meet = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const inside = (b: Box, c: PatchCard) => c.x >= b.x - 0.5 && c.y >= b.y - 0.5 && c.x + c.w <= b.x + b.w + 0.5 && c.y + c.h <= b.y + b.h + 0.5;
  const filled = patches.map((p) => {
    const mine = (k: number) => families[k]?.includes(p.tincture);
    // Each box of parents with the boxes of their own children under it: one family unit, filled out to the
    // box round all of it. (Units of the generations after overlap it; their fills step down with them.)
    const units = new Map<number, Set<number>>();
    for (const [child, parent] of links) {
      if (!mine(child) || !mine(parent)) continue;
      const bp = p.boxes.findIndex((box) => inside(box, cards[parent]));
      const bc = p.boxes.findIndex((box) => inside(box, cards[child]));
      if (bp < 0 || bc < 0 || bp === bc) continue;
      (units.get(bp) ?? units.set(bp, new Set()).get(bp)!).add(bc);
    }
    // Only a unit that stands close together: the box round it no more than FILL_RATIO times what its own boxes
    // take. A family whose children stand far apart (across the chart, far down a column) keeps its plain boxes.
    const fills = [...units]
      .map(([bp, kids]) => [p.boxes[bp], ...[...kids].map((k) => p.boxes[k])])
      .filter((own) => {
        const box = around(own);
        return box.w * box.h <= FILL_RATIO * own.reduce((sum, b) => sum + b.w * b.h, 0);
      })
      .map(around);
    return fills;
  });
  const area = (b: Box) => b.w * b.h;
  return patches.map((p, i) => ({
    ...p,
    cuts: patches.flatMap((q, j) =>
      j === i ? [] : q.boxes.filter((b) => p.boxes.some((own) => meet(own, b))).map((box) => ({ box, stripe: i < j ? ('a' as const) : ('b' as const) })),
    ),
    fills: filled[i].map((box) => ({
      box,
      // Another family's boxes keep their own colour; of two filled boxes that meet, the smaller keeps its colour (the first, of two as big).
      others: patches.flatMap((q, j) =>
        j === i
          ? []
          : [...q.boxes.filter((b) => meet(box, b)), ...filled[j].filter((f) => meet(box, f) && (area(f) < area(box) || (area(f) === area(box) && j < i)))],
      ),
    })),
  }));
}

/** The box round some boxes. */
function around(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** A piece of the families' backgrounds as drawn: one family's colour, or (`with`) stripes of two. */
export interface Painted {
  tincture: string;
  with?: string;
  box: Box;
}

/**
 * The families' backgrounds as plain rectangles that never overlap, each in one family's colour or striped in
 * two: what `familyBackgrounds` says, worked out once, so the chart draws them without masks or layers that
 * would have to be worked out again at every step of a zoom.
 */
export function paintBackgrounds(patches: readonly FamilyPatch[]): Painted[] {
  const out: Painted[] = [];
  const meet = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const holds = (b: Box, x: number, y: number) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
  patches.forEach((p, i) => {
    const own = [...p.boxes, ...p.fills.map((f) => f.box)];
    if (!own.length) return;
    // Other families' boxes that reach into this family's: shared, and striped there.
    const others = patches.flatMap((q, j) => (j === i ? [] : q.boxes.filter((b) => p.boxes.some((o) => meet(o, b))).map((box) => ({ box, j }))));
    const pieces = [...own, ...p.fills.flatMap((f) => f.others), ...others.map((o) => o.box)];
    const xs = [...new Set(pieces.flatMap((b) => [b.x, b.x + b.w]))].sort((a, b) => a - b);
    const ys = [...new Set(pieces.flatMap((b) => [b.y, b.y + b.h]))].sort((a, b) => a - b);
    for (let r = 0; r + 1 < ys.length; r++) {
      const y = (ys[r] + ys[r + 1]) / 2;
      let run: Painted | undefined;
      for (let c = 0; c + 1 < xs.length; c++) {
        const x = (xs[c] + xs[c + 1]) / 2;
        const inBox = p.boxes.some((b) => holds(b, x, y));
        const inFill = !inBox && p.fills.some((f) => holds(f.box, x, y) && !f.others.some((o) => holds(o, x, y)));
        let paint: Painted | undefined;
        if (inBox) {
          const shared = others.find((o) => holds(o.box, x, y));
          // A piece two families share is drawn once, striped, by the first of them.
          if (!shared) paint = { tincture: p.tincture, box: { x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r] } };
          else if (i < shared.j)
            paint = { tincture: p.tincture, with: patches[shared.j].tincture, box: { x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r] } };
        } else if (inFill) paint = { tincture: p.tincture, box: { x: xs[c], y: ys[r], w: xs[c + 1] - xs[c], h: ys[r + 1] - ys[r] } };
        // Side by side and alike: one rectangle.
        if (paint && run && run.with === paint.with && Math.abs(run.box.x + run.box.w - paint.box.x) < 0.01) run.box.w += paint.box.w;
        else {
          run = paint;
          if (paint) out.push(paint);
        }
      }
    }
  });
  return out;
}
