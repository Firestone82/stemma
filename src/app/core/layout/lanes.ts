/**
 * Lines of different families never run along each other.
 *
 * The layout puts the bar of every family halfway between the parents' row and the children's, and leads
 * the line to a child across the same gap. Two families whose lines meet in one gap (two marriages of one
 * person, or a family whose child stands far from it, its line led under or over another family) may then
 * have their bars on the same level, one over the other: read as one line, from the wrong parents to the
 * wrong children. Here such a stretch is moved aside into a lane of its own, a few units up or down (or left
 * or right, for an upright one), together with every line of its family that runs along it, so brothers and
 * sisters keep sharing it. A stretch is moved only where the move keeps it clear of every card and leaves it
 * crossing no more lines than before.
 */
import { LayoutLine, LayoutUnion, Pt } from './types';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A straight stretch of a line (or of the line between partners). */
interface Run {
  family: string;
  /** Index of the line in the list, or -1 for the line between partners (never moved). */
  line: number;
  /** The stretch runs from point `i` to point `i + 1`. */
  i: number;
  level: boolean;
  /** Its y when level, its x when upright. */
  at: number;
  lo: number;
  hi: number;
  /** A stretch between two bends that turn the same way it can be moved across: not the first or last of a line. */
  movable: boolean;
  trunk: boolean;
}

/** How near another family's stretch counts as on top of it. */
const SAME = 0.5;
/** How long a stretch two lines share must be to count. */
const SHARED = 1;
/** How many lanes either side of where a stretch is the search looks at. */
const LANES = 6;
/** Lanes are tried this many times over; a move may make room for another. */
const ROUNDS = 400;

const close = (a: number, b: number) => Math.abs(a - b) < 0.01;

function runsOf(lines: readonly LayoutLine[], unions: readonly LayoutUnion[]): Run[] {
  const out: Run[] = [];
  const add = (family: string, line: number, points: readonly Pt[], trunk: boolean) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const level = close(a.y, b.y);
      if (!level && !close(a.x, b.x)) continue;
      if (level && close(a.x, b.x)) continue;
      let movable = line >= 0 && i >= 2 && i <= points.length - 2;
      if (movable) {
        // Bends on both ends, the stretches before and after it at right angles to it.
        const p = points[i - 2];
        const q = points[i + 1];
        movable = level ? close(p.x, a.x) && close(q.x, b.x) : close(p.y, a.y) && close(q.y, b.y);
      }
      out.push({
        family,
        line,
        i: i - 1,
        level,
        at: level ? a.y : a.x,
        lo: level ? Math.min(a.x, b.x) : Math.min(a.y, b.y),
        hi: level ? Math.max(a.x, b.x) : Math.max(a.y, b.y),
        movable,
        trunk,
      });
    }
  };
  lines.forEach((l, n) => add(l.familyId, n, l.points, l.trunk));
  for (const u of unions) add(u.familyId, -1, u.line, false);
  return out;
}

const overlap = (a: Run, b: Run) => Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo);

/** Whether a level and an upright stretch cross, away from the ends of either. */
function cross(h: Run, v: Run): boolean {
  return v.at > h.lo + 1 && v.at < h.hi - 1 && h.at > v.lo + 1 && h.at < v.hi - 1;
}

/** Pairs of stretches of different families on top of each other. */
function clashes(runs: readonly Run[]): [Run, Run][] {
  const buckets = new Map<string, Run[]>();
  const key = (level: boolean, at: number) => `${level ? 'h' : 'v'}${Math.round(at)}`;
  for (const r of runs) {
    const k = key(r.level, r.at);
    const list = buckets.get(k);
    if (list) list.push(r);
    else buckets.set(k, [r]);
  }
  const order = new Map(runs.map((r, n) => [r, n]));
  const out: [Run, Run][] = [];
  for (const r of runs) {
    for (const d of [-1, 0, 1]) {
      for (const s of buckets.get(key(r.level, Math.round(r.at) + d)) ?? []) {
        if (s === r || s.family === r.family || Math.abs(s.at - r.at) > SAME || overlap(r, s) <= SHARED) continue;
        // Each pair once.
        if (order.get(s)! < order.get(r)!) continue;
        out.push([r, s]);
      }
    }
  }
  return out;
}

/** How badly the stretches of `mine` lie on the others: a stretch on top of another counts far more than a crossing. */
function badness(mine: readonly Run[], others: readonly Run[]): number {
  let bad = 0;
  for (const m of mine) {
    for (const o of others) {
      if (o.level === m.level) {
        if (Math.abs(o.at - m.at) <= SAME && overlap(m, o) > SHARED) bad += 1000;
      } else if (m.level ? cross(m, o) : cross(o, m)) bad += 1;
    }
  }
  return bad;
}

/** Whether the stretch from a to b comes within `pad` of a card. */
function nearCard(a: Pt, b: Pt, boxes: readonly Rect[], pad: number): boolean {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return boxes.some((c) => x0 < c.x + c.w + pad && x1 > c.x - pad && y0 < c.y + c.h + pad && y1 > c.y - pad);
}

/**
 * The lines with no stretch of one family on top of a stretch of another, where a lane is to be found for it.
 * `step` is how far apart two lanes are; `pad` how close a line may come to a card it does not lead to.
 */
export function separate(lines: readonly LayoutLine[], unions: readonly LayoutUnion[], boxes: readonly Rect[], step: number, pad = 3): LayoutLine[] {
  let current = lines;
  let runs = runsOf(current, unions);
  let found = clashes(runs);
  if (!found.length) return [...lines];
  current = lines.map((l) => ({ ...l, points: l.points.map((p) => ({ ...p })) }));
  const stuck = new Set<string>();
  const groupKey = (r: Run) => `${r.family}|${r.level ? 'h' : 'v'}|${Math.round(r.at * 100)}`;

  /** Every movable stretch of the family of `r` on the same level as it, or undefined when `r` cannot be moved. */
  const groupOf = (r: Run): Run[] | undefined => {
    if (!r.movable) return undefined;
    const g = runs.filter((s) => s.line >= 0 && s.family === r.family && s.level === r.level && Math.abs(s.at - r.at) < 0.01);
    return g.every((s) => s.movable) ? g : undefined;
  };

  /** Moves the stretches of a group into the best free lane; whether one was found. */
  const shift = (group: Run[]): boolean => {
    const level = group[0].level;
    const at = group[0].at;
    const lineIds = [...new Set(group.map((r) => r.line))];
    const others = runs.filter((r) => r.family !== group[0].family);
    const mineNow = runs.filter((r) => lineIds.includes(r.line));
    const before = badness(mineNow, others);
    let best: { lines: Map<number, Pt[]>; bad: number } | undefined;
    for (let k = 1; k <= LANES && !(best && best.bad === 0); k++) {
      for (const sign of [-1, 1]) {
        const to = at + sign * k * step;
        const moved = new Map<number, Pt[]>();
        let ok = true;
        for (const r of group) {
          const pts = moved.get(r.line) ?? current[r.line].points.map((p) => ({ ...p }));
          moved.set(r.line, pts);
          const coord = (p: Pt) => (level ? p.y : p.x);
          // The stretches either side keep running the way they ran, and keep a little length.
          for (const end of [coord(pts[r.i - 1]), coord(pts[r.i + 2])]) {
            if ((at - end) * (to - end) <= 0 || Math.abs(to - end) < 2) ok = false;
          }
          if (!ok) break;
          for (const j of [r.i, r.i + 1]) pts[j] = level ? { x: pts[j].x, y: to } : { x: to, y: pts[j].y };
          // The stretch moved, and what the stretches either side of it gained, stay clear of every card.
          const was = (p: Pt): Pt => (level ? { x: p.x, y: at } : { x: at, y: p.y });
          if (
            nearCard(pts[r.i], pts[r.i + 1], boxes, pad) ||
            nearCard(was(pts[r.i]), pts[r.i], boxes, pad) ||
            nearCard(was(pts[r.i + 1]), pts[r.i + 1], boxes, pad)
          ) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        const trial = current.map((l, n) => (moved.has(n) ? { ...l, points: moved.get(n)! } : l));
        const mine = runsOf(trial, []).filter((r) => moved.has(r.line));
        const bad = badness(mine, others);
        if (bad < before && (!best || bad < best.bad)) best = { lines: moved, bad };
      }
    }
    if (!best) return false;
    for (const [n, pts] of best.lines) current = current.map((l, m) => (m === n ? { ...l, points: pts } : l));
    return true;
  };

  for (let round = 0; round < ROUNDS && found.length; round++) {
    let moved = false;
    for (const [a, b] of found) {
      const pair = [groupKey(a), groupKey(b)].sort().join('&');
      if (stuck.has(pair)) continue;
      // Rather the line that is not in the direct line, and then the shorter.
      const groups = [groupOf(a), groupOf(b)]
        .filter((g): g is Run[] => !!g)
        .sort(
          (p, q) =>
            Number(p.some((r) => r.trunk)) - Number(q.some((r) => r.trunk)) || p.reduce((s, r) => s + r.hi - r.lo, 0) - q.reduce((s, r) => s + r.hi - r.lo, 0),
        );
      if (groups.some((g) => shift(g))) {
        moved = true;
        break;
      }
      stuck.add(pair);
    }
    if (!moved) break;
    runs = runsOf(current, unions);
    found = clashes(runs);
  }
  return current.map((l) => ({ ...l, points: tidy(l.points) }));
}

/** Points without repeats or points in the middle of a straight run. */
function tidy(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const a = out[out.length - 1];
    if (a && close(a.x, p.x) && close(a.y, p.y)) continue;
    const b = out[out.length - 2];
    if (a && b && ((close(a.x, b.x) && close(a.x, p.x)) || (close(a.y, b.y) && close(a.y, p.y)))) out.pop();
    out.push(p);
  }
  return out;
}
