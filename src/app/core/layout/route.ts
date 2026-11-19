/**
 * Lines led again after cards were moved by hand: from where a line starts (the parents' marker, or the foot of a
 * lone parent's card) down to the top of the child's card by the shortest way that goes through no other card.
 *
 * The way is searched on the grid that the cards' edges (kept clear by a margin) and the line's two ends make:
 * straight runs only, every bend costing about as much as a run of BEND units, so a route with fewer bends is
 * taken over a slightly shorter one. A line always leaves its start downwards and comes into its card from
 * above, so the connectors stay where the layout has them. Where brothers and sisters hang from one marker, a
 * stretch that the line of a brother or sister drawn before already runs along costs little, so they keep sharing
 * the way down and the bar, as the layout draws them.
 */
import { LayoutCard, LayoutLine, LayoutPlaceholder, LayoutUnion, Pt } from './types';

/** How far a line keeps from a card it passes, unless asked otherwise (see reroute). */
export const CLEARANCE = 12;
/** A bend costs as much as this many units of line. */
const BEND = 22;
/** A stretch already drawn by a line of the same family costs this share of its length. */
const SHARED = 0.3;
/** A stretch run along a line of another family costs this many times its length: it would read as one line. */
const OTHERS = 8;
/** How far beside another family's line a line may run instead. */
const BESIDE = 8;
/** How far round a line the search looks first; the whole chart when that finds nothing. */
const WINDOW = 160;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;
const DOWN = 2;

const boxOf = (c: { x: number; y: number; w: number; h: number }, pad: number): Box => ({
  x0: c.x - pad,
  y0: c.y - pad,
  x1: c.x + c.w + pad,
  y1: c.y + c.h + pad,
});
const inside = (b: Box, x: number, y: number) => x > b.x0 + 1e-6 && x < b.x1 - 1e-6 && y > b.y0 + 1e-6 && y < b.y1 - 1e-6;

/** A binary min-heap of [cost, state]. */
class Heap {
  private readonly cost: number[] = [];
  private readonly item: number[] = [];
  get size(): number {
    return this.cost.length;
  }
  push(cost: number, item: number): void {
    let i = this.cost.length;
    this.cost.push(cost);
    this.item.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cost[p] <= this.cost[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.cost[0], this.item[0]];
    const last = this.cost.length - 1;
    this.swap(0, last);
    this.cost.pop();
    this.item.pop();
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < last && this.cost[l] < this.cost[m]) m = l;
      if (r < last && this.cost[r] < this.cost[m]) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.cost[a], this.cost[b]] = [this.cost[b], this.cost[a]];
    [this.item[a], this.item[b]] = [this.item[b], this.item[a]];
  }
}

/** Whether the straight stretch between two points lies along (inside) a stretch already drawn. */
function along(drawn: readonly [Pt, Pt][], a: Pt, b: Pt): boolean {
  const level = Math.abs(a.y - b.y) < 0.01;
  return drawn.some(([p, q]) => {
    if (level)
      return (
        Math.abs(p.y - a.y) < 0.01 &&
        Math.abs(q.y - a.y) < 0.01 &&
        Math.min(p.x, q.x) <= Math.min(a.x, b.x) + 0.01 &&
        Math.max(p.x, q.x) >= Math.max(a.x, b.x) - 0.01
      );
    return (
      Math.abs(p.x - a.x) < 0.01 &&
      Math.abs(q.x - a.x) < 0.01 &&
      Math.min(p.y, q.y) <= Math.min(a.y, b.y) + 0.01 &&
      Math.max(p.y, q.y) >= Math.max(a.y, b.y) - 0.01
    );
  });
}

/** How long the straight stretch between two points runs along (on top of) stretches of other families. */
function onOthers(others: readonly [Pt, Pt][], a: Pt, b: Pt): number {
  const level = Math.abs(a.y - b.y) < 0.01;
  let sum = 0;
  for (const [p, q] of others) {
    if (level ? Math.abs(p.y - q.y) > 0.01 || Math.abs(p.y - a.y) > 0.5 : Math.abs(p.x - q.x) > 0.01 || Math.abs(p.x - a.x) > 0.5) continue;
    const o = level
      ? Math.min(Math.max(p.x, q.x), Math.max(a.x, b.x)) - Math.max(Math.min(p.x, q.x), Math.min(a.x, b.x))
      : Math.min(Math.max(p.y, q.y), Math.max(a.y, b.y)) - Math.max(Math.min(p.y, q.y), Math.min(a.y, b.y));
    if (o > 0) sum += o;
  }
  return sum;
}

/** The values with those between them that leave room for a lane (a gap wider than two clearances is also used down its middle). */
function withLanes(values: number[], clearance = CLEARANCE): number[] {
  const sorted = [...new Set(values.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  const out = [...sorted];
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > clearance * 2) out.push((sorted[i] + sorted[i - 1]) / 2);
  return out.sort((a, b) => a - b);
}

/**
 * The shortest straight-runs route from `from` (leaving downwards) to `to` (arriving from above) round the
 * `blocks`, or undefined where there is none. `drawn` are stretches that cost little. `branches` are the lines
 * of brothers and sisters from the same start: the route may branch off any of them (but the stretch into their
 * card), and then runs along it from the start to where it branches off, so the two are drawn as one line.
 * `others` are stretches of other families' lines: running along one costs much, and lanes beside them are tried.
 */
export function route(
  from: Pt,
  to: Pt,
  blocks: readonly Box[],
  drawn: readonly [Pt, Pt][] = [],
  stub = CLEARANCE + 3,
  branches: readonly (readonly Pt[])[] = [],
  others: readonly [Pt, Pt][] = [],
): Pt[] | undefined {
  const a: Pt = { x: from.x, y: from.y + stub };
  const z: Pt = { x: to.x, y: to.y - stub };
  if (blocks.some((b) => inside(b, z.x, z.y))) return undefined;
  const fromStart = !blocks.some((b) => inside(b, a.x, a.y));
  const trunks = branches.filter((b) => b.length > 2 && Math.abs(b[0].x - from.x) < 0.01 && Math.abs(b[0].y - from.y) < 0.01);
  const level = (p: Pt, q: Pt) => Math.abs(p.y - q.y) < 0.01;
  // Lanes beside the stretches of other families that lie between the two ends.
  const x0 = Math.min(a.x, z.x) - WINDOW;
  const x1 = Math.max(a.x, z.x) + WINDOW;
  const y0 = Math.min(a.y, z.y) - WINDOW;
  const y1 = Math.max(a.y, z.y) + WINDOW;
  const besideX: number[] = [];
  const besideY: number[] = [];
  for (const [p, q] of others) {
    if (Math.max(p.x, q.x) < x0 || Math.min(p.x, q.x) > x1 || Math.max(p.y, q.y) < y0 || Math.min(p.y, q.y) > y1) continue;
    if (level(p, q)) besideY.push(p.y - BESIDE, p.y + BESIDE);
    else if (Math.abs(p.x - q.x) < 0.01) besideX.push(p.x - BESIDE, p.x + BESIDE);
  }
  const xs = withLanes(
    [
      a.x,
      z.x,
      ...besideX,
      ...blocks.flatMap((b) => [b.x0, b.x1]),
      ...trunks.flatMap((t) =>
        t
          .slice(0, -1)
          .filter((p, i, all) => i > 0 && !level(all[i - 1], p))
          .map((p) => p.x),
      ),
    ],
    stub - 3,
  );
  const ys = withLanes(
    [
      a.y,
      z.y,
      ...besideY,
      ...blocks.flatMap((b) => [b.y0, b.y1]),
      ...trunks.flatMap((t) =>
        t
          .slice(0, -1)
          .filter((p, i, all) => i > 0 && level(all[i - 1], p))
          .map((p) => p.y),
      ),
    ],
    stub - 3,
  );
  const nx = xs.length;
  const ny = ys.length;
  const ix = (x: number) => xs.findIndex((v) => Math.abs(v - x) < 0.02);
  const iy = (y: number) => ys.findIndex((v) => Math.abs(v - y) < 0.02);
  const start = { i: ix(a.x), j: iy(a.y) };
  const goal = { i: ix(z.x), j: iy(z.y) };
  if (goal.i < 0 || goal.j < 0) return undefined;
  // Which nodes lie free, and which steps between neighbours are clear (a step is blocked when its middle is inside a block).
  const free = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) free[j * nx + i] = blocks.some((b) => inside(b, xs[i], ys[j])) ? 0 : 1;
  const clear = (x: number, y: number) => !blocks.some((b) => inside(b, x, y));
  const state = (i: number, j: number, d: number) => (j * nx + i) * 4 + d;
  const best = new Float64Array(nx * ny * 4).fill(Infinity);
  const prev = new Int32Array(nx * ny * 4).fill(-1);
  const heap = new Heap();
  /** Where a route may begin, by node: the line drawn from the start up to there. */
  const begins = new Map<number, Pt[]>();
  if (fromStart && start.i >= 0 && start.j >= 0) {
    begins.set(start.j * nx + start.i, [from]);
    best[state(start.i, start.j, DOWN)] = 0;
    heap.push(0, state(start.i, start.j, DOWN));
  }
  // Off a brother's or sister's line: anywhere along it but the stretch into their card, at no cost (the way
  // there is drawn already). In any direction but back along it.
  for (const t of trunks) {
    for (let k = 1; k < t.length - 1; k++) {
      const p = t[k - 1];
      const q = t[k];
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const x = xs[i];
          const y = ys[j];
          const on = level(p, q)
            ? Math.abs(y - p.y) < 0.02 && x >= Math.min(p.x, q.x) - 0.02 && x <= Math.max(p.x, q.x) + 0.02
            : Math.abs(x - p.x) < 0.02 && y >= Math.min(p.y, q.y) - 0.02 && y <= Math.max(p.y, q.y) + 0.02;
          if (!on || !free[j * nx + i]) continue;
          const cell = j * nx + i;
          const prefix = [...t.slice(0, k), { x, y }];
          const was = begins.get(cell);
          if (was && length(was) <= length(prefix)) continue;
          begins.set(cell, prefix);
          for (let d = 0; d < 4; d++) {
            best[cell * 4 + d] = 0;
            heap.push(0, cell * 4 + d);
          }
        }
      }
    }
  }
  if (!heap.size) return undefined;
  let found = -1;
  while (heap.size) {
    const [cost, s] = heap.pop();
    if (cost > best[s]) continue;
    const d = s % 4;
    const cell = (s - d) / 4;
    const i = cell % nx;
    const j = (cell - i) / nx;
    if (i === goal.i && j === goal.j && d === DOWN) {
      found = s;
      break;
    }
    for (let nd = 0; nd < 4; nd++) {
      // No turning back on itself.
      if (nd === (d ^ 1)) continue;
      const ni = i + DIRS[nd].dx;
      const nj = j + DIRS[nd].dy;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || !free[nj * nx + ni]) continue;
      const p: Pt = { x: xs[i], y: ys[j] };
      const q: Pt = { x: xs[ni], y: ys[nj] };
      if (!clear((p.x + q.x) / 2, (p.y + q.y) / 2)) continue;
      const length = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
      const step = length * (along(drawn, p, q) ? SHARED : 1) + (others.length ? onOthers(others, p, q) * OTHERS : 0) + (nd === d ? 0 : BEND);
      const t = state(ni, nj, nd);
      if (cost + step < best[t]) {
        best[t] = cost + step;
        prev[t] = s;
        heap.push(cost + step, t);
      }
    }
  }
  if (found < 0) return undefined;
  const points: Pt[] = [];
  let first = found;
  for (let s = found; s >= 0; s = prev[s]) {
    const cell = (s - (s % 4)) / 4;
    const i = cell % nx;
    points.push({ x: xs[i], y: ys[(cell - i) / nx] });
    first = s;
  }
  points.reverse();
  const begin = begins.get((first - (first % 4)) / 4) ?? [from];
  return simplify([...begin, ...points.slice(1), to]);
}

/** The points without those in the middle of a straight run (or doubled). */
export function simplify(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1];
    const b = out[i + 1];
    const sameX = Math.abs(a.x - p.x) < 0.01 && Math.abs(p.x - b.x) < 0.01;
    const sameY = Math.abs(a.y - p.y) < 0.01 && Math.abs(p.y - b.y) < 0.01;
    return !sameX && !sameY;
  });
}

/** Whether a line runs through the inside of a block. */
export function crosses(points: readonly Pt[], blocks: readonly Box[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n;
      const y = a.y + ((b.y - a.y) * k) / n;
      if (blocks.some((box) => inside(box, x, y))) return true;
    }
  }
  return false;
}

/**
 * The lines of `lines` listed in `again` (by key), led from their start to their child by the shortest way
 * clear of every card but their child's and (for a lone parent) the parent's own; any other line is as it was.
 * A line for which no way round is found goes plainly down, across and down.
 */
export function reroute(
  lines: readonly LayoutLine[],
  again: ReadonlySet<string>,
  cards: readonly LayoutCard[],
  placeholders: readonly LayoutPlaceholder[] = [],
  clearance = CLEARANCE,
  unions: readonly LayoutUnion[] = [],
): LayoutLine[] {
  const stub = clearance + 3;
  const things = [...cards, ...placeholders];
  // Stretches drawn so far, by family: what the lines kept as they are run along, and then what is led again.
  const drawn = new Map<string, [Pt, Pt][]>();
  /** The stretches of every line (and line between partners) drawn so far, with whose family they are. */
  const all: { family: string; run: [Pt, Pt] }[] = [];
  for (const u of unions) for (let i = 1; i < u.line.length; i++) all.push({ family: u.familyId, run: [u.line[i - 1], u.line[i]] });
  /** The lines of each family drawn so far, whole: to branch off. */
  const whole = new Map<string, Pt[][]>();
  const note = (l: LayoutLine) => {
    const list = drawn.get(l.familyId) ?? [];
    for (let i = 1; i < l.points.length; i++) {
      list.push([l.points[i - 1], l.points[i]]);
      all.push({ family: l.familyId, run: [l.points[i - 1], l.points[i]] });
    }
    drawn.set(l.familyId, list);
    whole.set(l.familyId, [...(whole.get(l.familyId) ?? []), l.points]);
  };
  for (const l of lines) if (!again.has(l.key)) note(l);
  const redone = new Map<string, LayoutLine>();
  // Nearest first: a short line is a good one to share.
  const order = lines.filter((l) => again.has(l.key)).sort((p, q) => length(p.points) - length(q.points));
  for (const l of order) {
    const start = l.points[0];
    const last = l.points[l.points.length - 1];
    // A line led again comes into the child's card from above, in the middle of its top, wherever it came in before
    // (from the side, in a list of children down a line).
    const child = cards
      .filter((c) => c.personId === l.childId)
      .sort((p, q) => Math.hypot(p.x + p.w / 2 - last.x, p.y - last.y) - Math.hypot(q.x + q.w / 2 - last.x, q.y - last.y))[0];
    const end = child && child.y > start.y + stub ? { x: child.x + child.w / 2, y: child.y } : last;
    const pad = clearance;
    // The cards at the line's two ends (the child's, and the parents' beside their marker) are kept clear of
    // without the margin: a marker between two partners may have less room than two margins round it.
    const reach = pad + stub + 1;
    const atEnd = (c: { x: number; y: number; w: number; h: number }) =>
      [start, end].some((p) => p.x > c.x - reach && p.x < c.x + c.w + reach && p.y > c.y - reach && p.y < c.y + c.h + reach);
    const near = (window: number) => {
      const x0 = Math.min(start.x, end.x) - window;
      const x1 = Math.max(start.x, end.x) + window;
      const y0 = Math.min(start.y, end.y) - window;
      const y1 = Math.max(start.y, end.y) + window;
      return things
        .filter((c) => c.x + c.w + pad >= x0 && c.x - pad <= x1 && c.y + c.h + pad >= y0 && c.y - pad <= y1)
        .map((c) => boxOf(c, atEnd(c) ? 0 : pad));
    };
    const family = drawn.get(l.familyId) ?? [];
    const trunks = whole.get(l.familyId) ?? [];
    const others = all.filter((r) => r.family !== l.familyId).map((r) => r.run);
    // The cards at the two ends stand in the way sideways too: a line leaves one from its foot and enters the other from above.
    // Where no way round is found, plainly down, across and down again: never the old route stretched to the new place.
    const points =
      route(start, end, near(WINDOW), family, stub, trunks, others) ?? route(start, end, near(1e5), family, stub, trunks, others) ?? plain(start, end, stub);
    const redoneLine = { ...l, points };
    redone.set(l.key, redoneLine);
    note(redoneLine);
  }
  return lines.map((l) => redone.get(l.key) ?? l);
}

/** Down from the start, across, and down into the card: the way when there is no way round. */
function plain(from: Pt, to: Pt, stub: number): Pt[] {
  const y = from.y + stub <= to.y - stub ? (from.y + to.y) / 2 : to.y - stub;
  return simplify([from, { x: from.x, y: Math.max(y, from.y + stub) }, { x: to.x, y: Math.max(y, from.y + stub) }, to]);
}

function length(points: readonly Pt[]): number {
  return points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
}

/** The keys of the lines that run through a card that is not one of their own ends. */
export function crossing(lines: readonly LayoutLine[], cards: readonly LayoutCard[], placeholders: readonly LayoutPlaceholder[] = []): Set<string> {
  const things = [...cards, ...placeholders];
  const out = new Set<string>();
  for (const l of lines) {
    const ends = [l.points[0], l.points[l.points.length - 1]];
    const mine = new Set(things.filter((c) => ends.some((p) => p.x > c.x - 0.6 && p.x < c.x + c.w + 0.6 && p.y > c.y - 0.6 && p.y < c.y + c.h + 0.6)));
    const blocks = things.filter((c) => !mine.has(c)).map((c) => boxOf(c, 1));
    if (crosses(l.points, blocks)) out.add(l.key);
  }
  return out;
}
