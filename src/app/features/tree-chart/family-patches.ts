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

/** How far apart cards of a row may stand and still be one box: the widest gap the editor leaves between cards standing together (EDITOR_LAYOUT.familyGap), and a little. */
const ROW_GAP = 80;
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

/** Something on the chart a family's background may not be filled over: a card, or a stretch of a line, and the families it belongs to. */
export interface Keep {
  box: Box;
  tinctures: readonly string[];
}

/**
 * Each family's background squared off: a gap in it (a notch at its edge, a hole, the room between two arms of
 * it) is filled, so the family stands in a rectangle as far as it can, where the gap is small (the family's
 * background on both sides of it, along a row or a column, no more than `most` apart) or the gap is a step in its edge no deeper than `step`, and nothing is in it: no card, no line
 * of another family, and no other family's background next to it, so the families keep their room between them.
 */
export function squareOff(painted: readonly Painted[], keep: readonly Keep[], most: number, step: number): Painted[] {
  if (!painted.length) return [...painted];
  const xs = [...new Set(painted.flatMap((p) => [p.box.x, p.box.x + p.box.w]))].sort((a, b) => a - b);
  const ys = [...new Set(painted.flatMap((p) => [p.box.y, p.box.y + p.box.h]))].sort((a, b) => a - b);
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  if (cols < 1 || rows < 1 || cols * rows > 4_000_000) return [...painted];
  const ix = new Map(xs.map((x, i) => [x, i]));
  const iy = new Map(ys.map((y, i) => [y, i]));
  /** Which painted piece is in each cell, by its index plus one; 0 where none is, -1 where something must stay clear. */
  const owner = new Int32Array(cols * rows);
  painted.forEach((p, n) => {
    const c0 = ix.get(p.box.x)!;
    const c1 = ix.get(p.box.x + p.box.w)!;
    const r0 = iy.get(p.box.y)!;
    const r1 = iy.get(p.box.y + p.box.h)!;
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) owner[r * cols + c] = n + 1;
  });
  /** The first index whose edge is at or past `v`. */
  const find = (edges: readonly number[], v: number) => {
    let lo = 0;
    let hi = edges.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (edges[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  /** The cells a box reaches into, as column and row ranges. */
  const cellsOf = (b: Box) => ({
    c0: Math.max(0, find(xs, b.x + 0.01) - 1),
    c1: Math.min(cols, find(xs, b.x + b.w - 0.01)),
    r0: Math.max(0, find(ys, b.y + 0.01) - 1),
    r1: Math.min(rows, find(ys, b.y + b.h - 0.01)),
  });
  // What stays clear, by cell, for whom: the families it belongs to may fill round it, no other.
  const kept = new Map<number, Set<string> | null>();
  for (const k of keep) {
    const { c0, c1, r0, r1 } = cellsOf(k.box);
    for (let r = r0; r < r1; r++)
      for (let c = c0; c < c1; c++) {
        const cell = r * cols + c;
        if (owner[cell] > 0) continue;
        const was = kept.get(cell);
        if (was === null) continue;
        if (!k.tinctures.length) kept.set(cell, null);
        else kept.set(cell, new Set([...(was ?? []), ...k.tinctures]));
      }
  }
  const near = (cell: number): number[] => {
    const c = cell % cols;
    const r = Math.floor(cell / cols);
    const out: number[] = [];
    if (c > 0) out.push(cell - 1);
    if (c + 1 < cols) out.push(cell + 1);
    if (r > 0) out.push(cell - cols);
    if (r + 1 < rows) out.push(cell + cols);
    return out;
  };
  const tinctures = [...new Set(painted.flatMap((p) => (p.with ? [p.tincture, p.with] : [p.tincture])))];
  const code = new Map(tinctures.map((t, i) => [t, i + 1]));
  /** The family a cell was filled with here, by its code. */
  const filled = new Int32Array(cols * rows);
  /** The families whose background is in a cell, painted or filled. */
  const of = (cell: number): string[] => {
    const o = owner[cell];
    if (o > 0) return painted[o - 1].with ? [painted[o - 1].tincture, painted[o - 1].with!] : [painted[o - 1].tincture];
    return filled[cell] ? [tinctures[filled[cell] - 1]] : [];
  };
  /**
   * The family a gap may be filled for from a cell: the one whose background it is, not where it is striped (a
   * card married into another family stands in that one's background, and does not take its own out into it).
   */
  const anchor = (cell: number): string[] => {
    const o = owner[cell];
    if (o > 0) return painted[o - 1].with ? [] : [painted[o - 1].tincture];
    return filled[cell] ? [tinctures[filled[cell] - 1]] : [];
  };
  const free = (cell: number, t: string) => {
    const k = kept.get(cell);
    return owner[cell] === 0 && !filled[cell] && k !== null && (!k || k.has(t));
  };
  /**
   * The families whose background is both ways along a row (or a column) from a cell, across nothing but free
   * cells, and no further apart than `most`.
   */
  const between = (cell: number, across: boolean): string[] => {
    const c = cell % cols;
    const r = Math.floor(cell / cols);
    const reach = (dir: -1 | 1): { found: string[]; length: number } => {
      let length = 0;
      let cc = c;
      let rr = r;
      for (;;) {
        if (across) cc += dir;
        else rr += dir;
        if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return { found: [], length };
        const n = rr * cols + cc;
        if (of(n).length) return { found: anchor(n), length };
        if (kept.get(n) === null) return { found: [], length };
        length += across ? xs[cc + 1] - xs[cc] : ys[rr + 1] - ys[rr];
        if (length > most) return { found: [], length };
      }
    };
    const back = reach(-1);
    const on = reach(1);
    const own = across ? xs[c + 1] - xs[c] : ys[r + 1] - ys[r];
    if (!back.found.length || back.length + on.length + own > most) return [];
    return back.found.filter((t) => on.found.includes(t));
  };
  /**
   * The families whose background is on two sides of a cell that meet at a corner, along a row one way and
   * along a column the other: a step in the edge of a background, filled where the background as it was drawn
   * is no more than `step` away across it. Along the step it reaches as far as the background beside it goes.
   */
  const corner = (cell: number): string[] => {
    const c = cell % cols;
    const r = Math.floor(cell / cols);
    /** The first background along a row (dr 0) or a column (dc 0) from the cell, and how far it is; only as drawn, or filled too. */
    const first = (dc: number, dr: number, drawn: boolean, c0 = c, r0 = r): { found: string[]; length: number } => {
      let length = 0;
      for (let cc = c0 + dc, rr = r0 + dr; cc >= 0 && cc < cols && rr >= 0 && rr < rows; cc += dc, rr += dr) {
        const n = rr * cols + cc;
        const o = owner[n];
        if (drawn ? o > 0 : of(n).length) return { found: anchor(n), length };
        if (kept.get(n) === null || length > most) break;
        length += dc ? xs[cc + 1] - xs[cc] : ys[rr + 1] - ys[rr];
      }
      return { found: [], length: Infinity };
    };
    const w = xs[c + 1] - xs[c];
    const h = ys[r + 1] - ys[r];
    const out: string[] = [];
    for (const dc of [-1, 1])
      for (const dr of [-1, 1]) {
        // Shallow up or down: the background as drawn close over or under it, and beside it, as drawn or filled.
        const over = first(0, dr, true);
        if (over.length + h <= step) {
          const side = first(dc, 0, false);
          out.push(...over.found.filter((t) => side.found.includes(t)));
        }
        const beside = first(dc, 0, true);
        if (beside.length + w <= step) {
          const end = first(0, dr, false);
          out.push(...beside.found.filter((t) => end.found.includes(t)));
        }
        // A bite out of a corner: the background as drawn beside it and over (or under) it, and the whole bite
        // no more than `most` either way.
        const top = first(0, dr, true);
        const both = beside.found.filter((t) => top.found.includes(t));
        if (!both.length || beside.length + w > most || top.length + h > most) continue;
        const reach = (along: boolean): number => {
          // How far the bite goes on the open side: as long as the arm across from it is still there.
          let length = along ? beside.length + w : top.length + h;
          for (let cc = c, rr = r; ;) {
            if (along) cc -= dc;
            else rr -= dr;
            if (cc < 0 || cc >= cols || rr < 0 || rr >= rows) return length;
            const n = rr * cols + cc;
            if (of(n).length || kept.get(n) === null) return length;
            const arm = along ? first(0, dr, true, cc, rr) : first(dc, 0, true, cc, rr);
            if (!arm.found.some((t) => both.includes(t)) || arm.length > most) return length;
            length += along ? xs[cc + 1] - xs[cc] : ys[rr + 1] - ys[rr];
            if (length > most) return length;
          }
        };
        if (reach(true) <= most && reach(false) <= most) out.push(...both);
      }
    return out;
  };
  // Every empty cell once; then, as cells are filled, the cells that may now have the family on both sides.
  let todo: number[] = [];
  for (let cell = 0; cell < cols * rows; cell++) if (owner[cell] === 0) todo.push(cell);
  for (let round = 0; round < 400 && todo.length; round++) {
    const now: number[] = [];
    for (const cell of todo) {
      // Only next to a background: further into a gap, cells come in turn as the ones beside them are filled.
      if (owner[cell] !== 0 || filled[cell] || !near(cell).some((n) => owner[n] > 0 || filled[n])) continue;
      const ts = [...between(cell, true), ...between(cell, false), ...corner(cell)];
      // Another family's background right next to it: the gap keeps the room between the two.
      const t = ts.find((x) => free(cell, x) && near(cell).every((n) => !of(n).length || of(n).includes(x)));
      if (!t) continue;
      filled[cell] = code.get(t)!;
      now.push(cell);
    }
    const next = new Set<number>();
    for (const cell of now) {
      const c = cell % cols;
      const r = Math.floor(cell / cols);
      for (const [dc, dr] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        let length = 0;
        for (let cc = c + dc, rr = r + dr; cc >= 0 && cc < cols && rr >= 0 && rr < rows && length <= most; cc += dc, rr += dr) {
          const n = rr * cols + cc;
          if (owner[n] !== 0) break;
          if (!filled[n]) next.add(n);
          length += dc ? xs[cc + 1] - xs[cc] : ys[rr + 1] - ys[rr];
        }
      }
    }
    todo = [...next];
  }
  const added: Painted[] = [];
  for (let cell = 0; cell < cols * rows; cell++) {
    if (!filled[cell]) continue;
    const gc = cell % cols;
    const gr = Math.floor(cell / cols);
    added.push({ tincture: tinctures[filled[cell] - 1], box: { x: xs[gc], y: ys[gr], w: xs[gc + 1] - xs[gc], h: ys[gr + 1] - ys[gr] } });
  }
  return [...painted, ...merged(added)];
}

/** Pieces of one colour side by side, or one over the other just as wide, as one rectangle. */
function merged(pieces: readonly Painted[]): Painted[] {
  const rows = new Map<string, Painted[]>();
  for (const p of pieces) {
    const k = `${p.tincture}|${p.box.y}|${p.box.h}`;
    rows.set(k, [...(rows.get(k) ?? []), p]);
  }
  const runs: Painted[] = [];
  for (const list of rows.values()) {
    list.sort((a, b) => a.box.x - b.box.x);
    let run: Painted | undefined;
    for (const p of list) {
      if (run && Math.abs(run.box.x + run.box.w - p.box.x) < 0.01) run.box.w = p.box.x + p.box.w - run.box.x;
      else runs.push((run = { tincture: p.tincture, box: { ...p.box } }));
    }
  }
  runs.sort((a, b) => a.box.x - b.box.x || a.box.y - b.box.y);
  const out: Painted[] = [];
  for (const p of runs) {
    const above = out.find(
      (q) =>
        q.tincture === p.tincture && Math.abs(q.box.x - p.box.x) < 0.01 && Math.abs(q.box.w - p.box.w) < 0.01 && Math.abs(q.box.y + q.box.h - p.box.y) < 0.01,
    );
    if (above) above.box.h += p.box.h;
    else out.push({ tincture: p.tincture, box: { ...p.box } });
  }
  return out;
}
