/** Lines as SVG path data: straight runs with rounded corners. */
import { LayoutLine, Pt } from './types';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** The path through `points`, its corners rounded with `radius` (or less, where a run is too short for it). */
export function roundedPath(points: readonly Pt[], radius = 8): string {
  if (points.length < 2) return '';
  let d = `M${r2(points[0].x)},${r2(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const inLen = Math.hypot(b.x - a.x, b.y - a.y);
    const outLen = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5) {
      d += `L${r2(b.x)},${r2(b.y)}`;
      continue;
    }
    const p = { x: b.x - ((b.x - a.x) / inLen) * r, y: b.y - ((b.y - a.y) / inLen) * r };
    const q = { x: b.x + ((c.x - b.x) / outLen) * r, y: b.y + ((c.y - b.y) / outLen) * r };
    d += `L${r2(p.x)},${r2(p.y)}Q${r2(b.x)},${r2(b.y)} ${r2(q.x)},${r2(q.y)}`;
  }
  const end = points[points.length - 1];
  return d + `L${r2(end.x)},${r2(end.y)}`;
}

/** Dashes for the line to a child who is not the couple's own by birth. */
export const RELATION_DASH: Readonly<Record<string, string>> = { adopted: '5 4', foster: '1.2 3.6', step: '9 4', unknown: '2 4' };

/**
 * Where what is left of a line begins, when the stretch before it is drawn already by a brother's or sister's
 * line. That line turned off there in a rounded bend, which leaves the corner itself out, so a piece that
 * began exactly at the corner would not touch it.
 *
 * At one of this line's own corners the piece starts a short way back along the shared stretch: the branch
 * then leaves it in a bend of its own, like the first, instead of butting onto it from the side. Further along
 * a straight stretch the piece starts a little before the place, over the end of the other line's bend.
 */
function startOf(points: readonly Pt[], i: number, start: Pt, radius: number): Pt[] {
  const from = points[i - 1];
  const along = Math.hypot(start.x - from.x, start.y - from.y);
  if (along > 0.01) {
    const back = Math.min(along, radius);
    return [{ x: start.x + ((from.x - start.x) * back) / along, y: start.y + ((from.y - start.y) * back) / along }];
  }
  if (i < 2) return [start];
  const before = points[i - 2];
  const length = Math.hypot(from.x - before.x, from.y - before.y);
  if (length < 0.01) return [start];
  const back = Math.min(length, radius * 2);
  return [{ x: from.x + ((before.x - from.x) * back) / length, y: from.y + ((before.y - from.y) * back) / length }, start];
}

/**
 * The lines as they are drawn, every stretch once. Brothers and sisters share the way down from their parents
 * and along the bar: drawn for each of them, the strokes lie on top of each other and the shared stretch
 * comes out heavier and darker than the rest. Here each line keeps only what no line before it (in the
 * order given: the most important first) has drawn already, as path data; '' when nothing of it is left.
 */
export function sharedPaths(lines: readonly LayoutLine[], radius = 7): string[] {
  const drawn = new Map<string, [number, number][]>();
  const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
  return lines.map((line) => {
    const pieces: Pt[][] = [];
    for (let i = 1; i < line.points.length; i++) {
      const p = line.points[i - 1];
      const q = line.points[i];
      const level = close(p.y, q.y);
      if (!level && !close(p.x, q.x)) {
        pieces.push([p, q]);
        continue;
      }
      const at = level ? p.y : p.x;
      const from = level ? p.x : p.y;
      const to = level ? q.x : q.y;
      const key = `${line.familyId}|${level ? 'h' : 'v'}|${Math.round(at * 10)}`;
      const spans = drawn.get(key) ?? [];
      let left: [number, number][] = [[Math.min(from, to), Math.max(from, to)]];
      for (const [s, e] of spans) {
        left = left.flatMap(([a, b]): [number, number][] => {
          if (e <= a + 0.01 || s >= b - 0.01) return [[a, b]];
          return [...(s > a + 0.01 ? [[a, s] as [number, number]] : []), ...(e < b - 0.01 ? [[e, b] as [number, number]] : [])];
        });
      }
      drawn.set(key, [...spans, [Math.min(from, to), Math.max(from, to)]]);
      if (to < from) left.reverse();
      for (const [a, b] of left) {
        const start = to < from ? b : a;
        const end = to < from ? a : b;
        const s: Pt = level ? { x: start, y: at } : { x: at, y: start };
        const e: Pt = level ? { x: end, y: at } : { x: at, y: end };
        const last = pieces[pieces.length - 1];
        const tail = last?.[last.length - 1];
        if (tail && close(tail.x, s.x) && close(tail.y, s.y)) last.push(e);
        else pieces.push([...startOf(line.points, i, s, radius), e]);
      }
    }
    return pieces.map((piece) => roundedPath(piece, radius)).join('');
  });
}
