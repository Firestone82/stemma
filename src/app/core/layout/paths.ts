/**
 * Turns layout geometry into SVG path data. Kept separate from the layout so the
 * same geometry can be drawn with square (rounded) or curved lines, and so the
 * geometry can be animated before it is turned into paths.
 */
import { LineStyle } from '../model/types';
import { LayoutConnector, LayoutLink, LayoutPass, LayoutUnion, Pt } from './layout-types';

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * How much higher a curved bridge between partners peaks than the square one
 * runs: a share of its height, but never more than a few units, so that it
 * stays clear of the family lines in the gap above the row.
 */
const ARCH_RISE = 0.6;
const ARCH_RISE_MAX = 9;

/** A polyline with rounded corners. */
export function roundedPath(points: Pt[], radius: number): string {
  const pts = dedupe(points);
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${r1(pts[0].x)},${r1(pts[0].y)}`;
  let d = `M${r1(pts[0].x)},${r1(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const inLen = dist(prev, cur);
    const outLen = dist(cur, next);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 0.5 || collinear(prev, cur, next)) {
      d += `L${r1(cur.x)},${r1(cur.y)}`;
      continue;
    }
    const a = towards(cur, prev, r);
    const b = towards(cur, next, r);
    d += `L${r1(a.x)},${r1(a.y)}Q${r1(cur.x)},${r1(cur.y)} ${r1(b.x)},${r1(b.y)}`;
  }
  const last = pts[pts.length - 1];
  d += `L${r1(last.x)},${r1(last.y)}`;
  return d;
}

/** A smooth vertical S-curve between two points. */
export function sCurve(a: Pt, b: Pt): string {
  return `M${r1(a.x)},${r1(a.y)}${sCurveTo(a, b)}`;
}

/** The curve command of an S-curve from a (the current point) to b. */
function sCurveTo(a: Pt, b: Pt): string {
  const my = (a.y + b.y) / 2;
  return `C${r1(a.x)},${r1(my)} ${r1(b.x)},${r1(my)} ${r1(b.x)},${r1(b.y)}`;
}

/**
 * An S-curve from a family's stem that runs straight down to `clearY`, the
 * edge of the parents' row, before it turns. A stem starts between the
 * partners' cards, and a curve that turned there would pass behind them.
 */
export function stemCurve(stem: Pt, clearY: number, to: Pt): string {
  if ((clearY - stem.y) * (to.y - clearY) <= 0) return sCurve(stem, to);
  const turn: Pt = { x: stem.x, y: clearY };
  return `M${r1(stem.x)},${r1(stem.y)}L${r1(turn.x)},${r1(turn.y)}${sCurveTo(turn, to)}`;
}

/** A smooth horizontal curve between two points (for partners in different rows). */
export function hCurve(a: Pt, b: Pt): string {
  const mx = (a.x + b.x) / 2;
  return `M${r1(a.x)},${r1(a.y)}C${r1(mx)},${r1(a.y)} ${r1(mx)},${r1(b.y)} ${r1(b.x)},${r1(b.y)}`;
}

/**
 * The line between partners. With curved lines, the line of partners who
 * have someone standing between them arches over in one sweep.
 */
export function unionLinePath(union: LayoutUnion, style: LineStyle = 'square', radius = 8): string {
  if (!union.line.length) return '';
  if (union.mode === 'split') return hCurve(union.line[0], union.line[union.line.length - 1]);
  if (union.mode === 'bridge' && style === 'curved' && union.line.length === 5) return bridgeArch(union.line);
  return roundedPath(union.line, radius);
}

/**
 * A bridge (see buildUnion in layout.ts) rises from the top of one partner's
 * card, runs over the people between them and comes down beside the other:
 * drawn curved, it rises and comes down in one arch, then goes straight on to
 * the marker between the cards. The arch is a little higher than the square
 * line runs, so that it reads as an arch even over a long way.
 */
function bridgeArch(line: Pt[]): string {
  const [rise, top, over, marker, end] = line;
  const height = rise.y - top.y;
  const peak = height + Math.sign(height) * Math.min(Math.abs(height) * ARCH_RISE, ARCH_RISE_MAX);
  // A cubic whose ends sit on the cards' top edge peaks at three quarters of its control points' height.
  const lift = (peak * 4) / 3;
  const c = r1(rise.y - lift);
  return `M${r1(rise.x)},${r1(rise.y)}C${r1(rise.x)},${c} ${r1(over.x)},${c} ${r1(over.x)},${r1(rise.y)}L${r1(marker.x)},${r1(marker.y)}L${r1(end.x)},${r1(end.y)}`;
}

/**
 * Where the note about a couple ("married", "divorced") goes: right under
 * their marker, between their cards, `gap` below its middle; for partners in
 * different rows, under the marker on the line between them. Null when there
 * is no couple (a single parent, parents not known).
 */
export function unionLabelPoint(u: LayoutUnion, gap = 13): Pt | null {
  const at = unionMarkerPoint(u);
  return at ? { x: at.x, y: at.y + gap } : null;
}

export interface DropPath {
  childId: string;
  relation: LayoutConnector['drops'][number]['relation'];
  d: string;
}

/**
 * One path per child, from the family's stem to the child's card. With square
 * lines the paths share the stem and bar, which overlap exactly.
 */
/** Offsets smaller than this are drawn as straight lines; nobody can see 3 px. */
const SNAP = 3;

/** The lines from a family down to each child (twins get a line each, like any other child). */
export function connectorPaths(c: LayoutConnector, style: LineStyle, radius = 10): DropPath[] {
  const single = c.drops.length === 1;
  return c.drops.map((drop) => {
    const target = drop.points[drop.points.length - 1];
    // A curved line is one spline from the parents to the child, turning only below the parents' row;
    // past rows it goes through, it runs straight between their cards and curves again below them.
    if (style === 'curved' && drop.points.length === 1) {
      if (Math.abs(target.x - c.stem.x) <= SNAP) {
        return { childId: drop.childId, relation: drop.relation, d: roundedPath([{ x: target.x, y: c.stem.y }, target], radius) };
      }
      return { childId: drop.childId, relation: drop.relation, d: stemCurve(c.stem, c.clearY, target) };
    }
    if (style === 'curved' && drop.through?.length) {
      return { childId: drop.childId, relation: drop.relation, d: curveThrough(c, drop.through, target) };
    }
    // A single child almost straight below its parents gets a straight line.
    const stem = single && Math.abs(drop.x - c.stem.x) <= SNAP ? { x: drop.x, y: c.stem.y } : c.stem;
    const pts: Pt[] = [stem];
    if (Math.abs(drop.x - stem.x) > 0.5) pts.push({ x: stem.x, y: c.barY }, { x: drop.x, y: c.barY });
    let x = drop.x;
    for (const p of drop.points) {
      // Tiny jogs along a long line are straightened the same way.
      const nx = Math.abs(p.x - x) <= SNAP ? x : p.x;
      pts.push({ x: nx, y: p.y });
      x = nx;
    }
    return { childId: drop.childId, relation: drop.relation, d: roundedPath(pts, radius) };
  });
}

/**
 * A curved line to a child more than one row down. It runs straight down
 * between the cards of every row it passes, and turns in an S-curve in each
 * gap between the rows, where the square line has its bends; where a row has
 * no cards on the side the line comes from or goes on to, the curve sweeps
 * through the row on that side instead, and through the whole row when both
 * sides are free.
 */
function curveThrough(c: LayoutConnector, through: readonly LayoutPass[], target: Pt): string {
  let at: Pt = c.stem;
  let d = `M${r1(at.x)},${r1(at.y)}`;
  // Straight down out of the parents' row first, as stemCurve does.
  if ((c.clearY - c.stem.y) * (target.y - c.clearY) > 0) {
    at = { x: c.stem.x, y: c.clearY };
    d += `L${r1(at.x)},${r1(at.y)}`;
  }
  for (const pass of through) {
    const top = { x: pass.x, y: pass.from };
    const bottom = { x: pass.x, y: pass.to };
    // A row with nothing under the line on both sides is swept through in one curve.
    if (pass.clearAbove && pass.clearBelow) continue;
    if (pass.clearAbove) {
      // Nothing between where the line comes from and the pass: the curve may come down through the row.
      d += sCurveTo(at, bottom);
      at = bottom;
    } else {
      d += sCurveTo(at, top);
      at = top;
      if (!pass.clearBelow) {
        d += `L${r1(bottom.x)},${r1(bottom.y)}`;
        at = bottom;
      }
      // Otherwise the next curve leaves from the top of the row and passes through it.
    }
  }
  return d + sCurveTo(at, target);
}

export function linkPath(link: LayoutLink): string {
  return stemCurve(link.from, link.clearY, link.to);
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function towards(from: Pt, to: Pt, len: number): Pt {
  const d = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / d) * len, y: from.y + ((to.y - from.y) / d) * len };
}

function collinear(a: Pt, b: Pt, c: Pt): boolean {
  return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 0.01;
}

function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.05 || Math.abs(last.y - p.y) > 0.05) out.push(p);
  }
  return out;
}

/** Where a union's marker sits, or null when it has none (a lone parent, parents not known). */
export function unionMarkerPoint(u: LayoutUnion): Pt | null {
  if (u.mode === 'split' && u.line.length === 2) return { x: (u.line[0].x + u.line[1].x) / 2, y: (u.line[0].y + u.line[1].y) / 2 };
  if (u.mode === 'gap' || u.mode === 'bridge' || u.mode === 'split' || u.mode === 'tucked') return { x: u.cx, y: u.cy };
  return null;
}
