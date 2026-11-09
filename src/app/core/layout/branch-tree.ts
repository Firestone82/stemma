/**
 * The family drawn as a tree, the way old family-tree prints are painted. The
 * trunk stands behind the couple the print is centred on. Every line between
 * parents and children is a bough of wood: from each person a branch rises to
 * a fork and splits to their father and mother, brothers and sisters grow from
 * the same fork as twigs, and the wood thins with every generation it is from
 * the trunk (not with how long a branch is or how many people it carries).
 * Below the couple the trunk spreads into roots that reach their children and
 * grandchildren. Leaves and blossom grow along the branches, more of them the
 * higher they are, so the crown has the shape of the family instead of being
 * one round mass over it.
 *
 * The shape follows the layout, so it always matches the family, and the
 * branches run where the family lines would, so the print needs no other
 * lines. Leaves and twigs are placed with a seeded random generator: the same
 * tree always comes out the same.
 */
import { TreeIndex } from '../model/tree-index';
import { Family } from '../model/types';
import { Foliage, clump, emptyFoliage, leafPath } from './foliage';
import { LayoutCard, LayoutConnector, LayoutResult, Pt } from './layout-types';
import { cubic, lengths, offsetLine, outline, seeded, tangent } from './organic';

export interface BranchTree {
  /** Filled outlines: trunk, boughs, twigs and roots. */
  wood: string[];
  /** Thin twigs drawn under the leaves, so they disappear into them. */
  twigs: string[];
  /** Lines along the thicker wood, like bark. */
  bark: string[];
  foliage: Foliage;
  /** Blossom among the leaves, in two tones. */
  blooms: [string[], string[]];
}

export interface TreeRoom {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BranchTreeOptions {
  /** The area the tree may use; twigs and roots stay inside it. Defaults to the chart with some space around it. */
  room?: TreeRoom;
  /** How leafy the tree is, from 0 (bare wood) to 1. */
  leaves?: number;
}

/** How much thinner the wood gets with every generation away from the trunk. */
const THINNING = 0.62;

export function branchTree(layout: LayoutResult, index: TreeIndex, focusIds: readonly string[], options: BranchTreeOptions = {}): BranchTree | null {
  const cardOf = new Map(layout.cards.map((c) => [c.personId, c]));
  const present = focusIds.filter((id) => cardOf.has(id));
  if (!present.length) return null;

  // The usual card size sets the scale; a card made wider for a long relationship name does not.
  const S = Math.min(...layout.cards.map((c) => c.w));
  const H = layout.cards[0].h;
  const b = layout.bounds;
  const room = options.room ?? { x: b.x - S, y: b.y - H * 1.6, w: b.w + S * 2, h: b.h + H * 3.2 };
  const leafiness = options.leaves ?? 1;
  const minW = Math.max(1.4, S * 0.012);
  const leafLen = Math.max(7, Math.min(16, S * 0.072));
  const unionOf = new Map(layout.unions.map((u) => [u.familyId, u]));

  const wood: string[] = [];
  const twigs: string[] = [];
  const bark: string[] = [];
  const foliage = emptyFoliage();
  const blooms: [string[], string[]] = [[], []];

  // --- who is how far from the trunk ------------------------------------------

  // A walk out from the couple over the people on the page: parents, children,
  // brothers and sisters one step away, a partner half a step. How far someone
  // is sets how thick the wood to them is.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const id of present) {
    depth.set(id, 0);
    queue.push(id);
  }
  const visit = (from: string, to: string, cost: number) => {
    if (!cardOf.has(to)) return;
    const d = depth.get(from)! + cost;
    const old = depth.get(to);
    if (old !== undefined && old <= d) return;
    depth.set(to, d);
    queue.push(to);
  };
  // Dijkstra on a handful of weights: the queue is sorted as it goes.
  while (queue.length) {
    queue.sort((a, b) => depth.get(a)! - depth.get(b)!);
    const id = queue.shift()!;
    for (const p of index.partners(id)) visit(id, p.id, 0.5);
    for (const p of index.parents(id)) visit(id, p.id, 1);
    for (const c of index.children(id)) visit(id, c.id, 1);
    for (const s of index.siblings(id)) visit(id, s.id, 1);
  }
  const maxDepth = Math.max(1, ...[...depth.values()].filter(Number.isFinite));

  // Horizontal bands taken by cards: how much free space is above or below a point.
  const bands = [...layout.rows, ...layout.lanes].map((r) => ({ top: r.y, bottom: r.y + r.h }));
  const spaceBelow = (y: number) => Math.min(room.y + room.h, ...bands.filter((x) => x.top >= y + 0.5).map((x) => x.top)) - y;

  // --- drawing helpers --------------------------------------------------------

  const lerp = (a: number, z: number, t: number) => a + (z - a) * t;
  /** How wide the wood is this many generations from the couple (halves for a fork between two). */
  const gw = (generations: number) => minW + (S * 0.085 - minW) * Math.pow(THINNING, Math.max(0, generations));
  const depthOf = (id: string, fallback: number) => {
    const d = depth.get(id);
    return d !== undefined && Number.isFinite(d) ? d : fallback;
  };

  /** A piece of wood along `line`, `w0` wide at the start and `w1` at the end; a thick piece gets bark lines. */
  const addWood = (line: Pt[], w0: number, w1: number, seed = 0, under = false) => {
    if (line.length < 2) return;
    const width = (t: number) => w0 + (w1 - w0) * Math.pow(t, 0.9);
    (under ? twigs : wood).push(outline(line, width, Math.max(w0, w1) > 6 ? 0.07 : 0.03, seed));
    if (Math.min(w0, w1) < 7) return;
    bark.push(offsetLine(line, width, 0.46, 0.1, 0.8), offsetLine(line, width, -0.3, 0.22, 0.66));
    if (Math.max(w0, w1) > 16) bark.push(offsetLine(line, width, 0.08, 0.3, 0.9));
  };

  /** Shortens a twig so it stays in the room; null when there is no room for it. */
  const fit = (from: Pt, angle: number, len: number): number | null => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let max = len;
    if (dx < -1e-6) max = Math.min(max, (room.x - from.x) / dx);
    if (dx > 1e-6) max = Math.min(max, (room.x + room.w - from.x) / dx);
    if (dy < -1e-6) max = Math.min(max, (room.y - from.y) / dy);
    if (dy > 1e-6) max = Math.min(max, (room.y + room.h - from.y) / dy);
    return max >= len * 0.35 ? max * 0.98 : null;
  };

  /** A gently curving twig; returns its centre line (or null when it does not fit). */
  const twigLine = (from: Pt, angle: number, len: number, rnd: () => number): Pt[] | null => {
    const l = fit(from, angle, len);
    if (l === null) return null;
    const bend = (rnd() - 0.5) * 0.7;
    const end = { x: from.x + Math.cos(angle + bend * 0.3) * l, y: from.y + Math.sin(angle + bend * 0.3) * l };
    const c1 = { x: from.x + Math.cos(angle - bend * 0.4) * l * 0.38, y: from.y + Math.sin(angle - bend * 0.4) * l * 0.38 };
    const c2 = { x: from.x + Math.cos(angle + bend * 0.5) * l * 0.74, y: from.y + Math.sin(angle + bend * 0.5) * l * 0.74 };
    return cubic(from, c1, c2, end, clamp(Math.round(l / 9), 5, 14));
  };

  /** A leaf tone: lighter when it points up, darker when it hangs, with some variety. */
  const toneFor = (angle: number, rnd: () => number) => {
    const t = (1 - Math.sin(angle)) / 2 + (rnd() - 0.5) * 0.6;
    return clamp(Math.floor(t * foliage.leaves.length), 0, foliage.leaves.length - 1);
  };

  /**
   * Leaves in pairs along a branch, with blossom among them. `amount` (0 to 1)
   * sets how dense: the higher in the tree, the leafier.
   */
  const leafy = (line: readonly Pt[], amount: number, rnd: () => number, from = 0.08, to = 0.92) => {
    if (leafiness <= 0 || amount <= 0.02 || line.length < 2) return;
    const s = lengths(line);
    const total = s[s.length - 1];
    if (total < leafLen * 1.5) return;
    const spacing = leafLen * (0.55 + (1 - amount) * 1.6);
    let side = rnd() < 0.5 ? 1 : -1;
    let i = 0;
    for (let at = total * from + rnd() * spacing * 0.5; at < total * to; at += spacing * (0.7 + rnd() * 0.6)) {
      while (i + 1 < s.length && s[i + 1] < at) i++;
      const tg = tangent(line, i);
      const dir = Math.atan2(tg.y, tg.x);
      const a = dir + side * (0.75 + rnd() * 0.5);
      side = -side;
      const p = line[i];
      if (rnd() < 0.22 * amount) {
        const r = leafLen * (0.2 + rnd() * 0.14);
        const q = { x: p.x + Math.cos(a) * leafLen * 0.5, y: p.y + Math.sin(a) * leafLen * 0.5 };
        blooms[rnd() < 0.55 ? 0 : 1].push(`M${r1(q.x - r)},${r1(q.y)}a${r1(r)},${r1(r)} 0 1,0 ${r1(r * 2)},0a${r1(r)},${r1(r)} 0 1,0 ${r1(-r * 2)},0Z`);
      } else {
        foliage.leaves[toneFor(a, rnd)].push(leafPath(p, a, leafLen * (0.75 + rnd() * 0.45)));
        // Now and then a second leaf next to the first, as leaves grow in pairs.
        if (rnd() < 0.35) foliage.leaves[toneFor(a, rnd)].push(leafPath(p, a + side * 0.5, leafLen * (0.65 + rnd() * 0.35)));
      }
    }
  };

  /** A leafy sprig growing out of a branch, with a small mass of leaves at its end. */
  const sprig = (from: Pt, angle: number, len: number, w: number, amount: number, rnd: () => number) => {
    const line = twigLine(from, angle, len, rnd);
    if (!line) return;
    addWood(line, w, minW * 0.8, 0, true);
    if (leafiness <= 0) return;
    leafy(line, Math.max(0.6, amount), rnd, 0.25, 1);
    const end = line[line.length - 1];
    foliage.leaves[toneFor(angle, rnd)].push(leafPath(end, angle + (rnd() - 0.5) * 0.4, leafLen * 1.05));
    if (rnd() < 0.5 * amount) clump(foliage, end, leafLen * (1.1 + rnd() * 0.5), leafLen * 0.85, rnd, { leaves: 5 });
  };

  /** A few leaves fanning out of a point, as they grow where a branch forks. */
  const tuft = (at: Pt, around: number, amount: number, rnd: () => number) => {
    if (leafiness <= 0) return;
    const count = 3 + Math.floor(rnd() * 3 * amount);
    for (let i = 0; i < count; i++) {
      const a = around + (i - (count - 1) / 2) * 0.55 + (rnd() - 0.5) * 0.3;
      const base = { x: at.x + Math.cos(a) * leafLen * 0.2, y: at.y + Math.sin(a) * leafLen * 0.2 };
      foliage.leaves[toneFor(a, rnd)].push(leafPath(base, a, leafLen * (0.8 + rnd() * 0.4)));
    }
  };

  /** Sprigs along a long branch, alternating sides and leaning upwards. */
  const sprigsAlong = (line: Pt[], width: (t: number) => number, amount: number, rnd: () => number) => {
    if (leafiness <= 0 || amount <= 0.05) return;
    const s = lengths(line);
    const total = s[s.length - 1];
    const spacing = (S * 0.36) / Math.max(0.3, amount);
    if (total < spacing * 0.8) return;
    let side = rnd() < 0.5 ? 1 : -1;
    let i = 0;
    for (let at = spacing * (0.35 + rnd() * 0.3); at < total * 0.88; at += spacing * (0.75 + rnd() * 0.5)) {
      while (i + 1 < s.length && s[i + 1] < at) i++;
      const tg = tangent(line, i);
      let a = Math.atan2(tg.y, tg.x) + side * (0.8 + rnd() * 0.4);
      a = towards(a, -Math.PI / 2, 0.35);
      side = -side;
      if (Math.sin(a) > 0.1) continue;
      const w = Math.max(minW, Math.min(width(at / total) * 0.3, S * 0.03));
      sprig(line[i], a, S * (0.12 + rnd() * 0.12), w, amount, rnd);
    }
  };

  /** A smooth bough through the points: up or down in S-curves, as the family lines run. */
  const bough = (points: readonly Pt[]): Pt[] => {
    const out: Pt[] = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i];
      const z = points[i + 1];
      const d = Math.hypot(z.x - a.x, z.y - a.y);
      const samples = clamp(Math.round(d / 10), 4, 24);
      const line =
        Math.abs(z.x - a.x) < 0.5 ? cubic(a, a, z, z, samples) : cubic(a, { x: a.x, y: (a.y + z.y) / 2 }, { x: z.x, y: (a.y + z.y) / 2 }, z, samples);
      out.push(...(i ? line.slice(1) : line));
    }
    return out;
  };

  /** The points of a drop from the fork of a family down to a child's card: through every row it passes. */
  const dropPoints = (fork: Pt, drop: LayoutConnector['drops'][number]): Pt[] => {
    const pts: Pt[] = [fork];
    const target = drop.points[drop.points.length - 1];
    for (const pass of drop.through ?? []) {
      if (!pass.clearAbove) pts.push({ x: pass.x, y: pass.from });
      if (!pass.clearBelow) pts.push({ x: pass.x, y: pass.to });
    }
    pts.push(target);
    return pts;
  };

  /** A branch from the fork of a family up to one of the parents, sweeping out and arriving under their card. */
  const arm = (fork: Pt, card: LayoutCard): Pt[] => {
    const to = { x: card.x + card.w / 2, y: card.y + card.h };
    const dy = Math.max(1, fork.y - to.y);
    const dx = to.x - fork.x;
    if (Math.abs(dx) < 1) return cubic(fork, fork, to, to, 6);
    const c1 = { x: fork.x + dx * 0.42, y: fork.y - dy * 0.12 };
    const c2 = { x: to.x, y: to.y + dy * 0.62 };
    const line = cubic(fork, c1, c2, to, clamp(Math.round(Math.hypot(dx, dy) / 10), 8, 24));
    // On into the card, so the wood does not stop short at its edge.
    line.push({ x: to.x, y: card.y + card.h * 0.5 });
    return line;
  };

  // --- which way each family grows -------------------------------------------------

  const descendants = new Set<string>();
  for (const id of present) {
    descendants.add(id);
    for (const d of index.descendants(id)) descendants.add(d);
  }
  const seed = (key: string) => seeded(`${key}:${S}`);

  // Families with children on the page: a branch system each.
  for (const conn of layout.connectors) {
    const family = index.family(conn.familyId);
    if (!family) continue;
    const partners = family.partners.filter((id) => cardOf.has(id));
    // The couple's own children and grandchildren are roots, drawn below.
    if (partners.some((id) => descendants.has(id))) continue;
    const children = conn.drops.filter((d) => cardOf.has(d.childId));
    if (!children.length) continue;
    const rnd = seed(`family:${conn.familyId}`);
    const fork: Pt = { x: conn.stem.x, y: conn.barY };
    const parentDepth = Math.min(Infinity, ...partners.map((id) => depth.get(id) ?? Infinity));
    const carrier = children.reduce((best, d) => ((depth.get(d.childId) ?? Infinity) < (depth.get(best.childId) ?? Infinity) ? d : best), children[0]);
    const childDepth = depth.get(carrier.childId) ?? Infinity;
    // How high in the tree this family is: the leafier.
    const amount = leafiness * clamp(0.45 + (0.55 * Math.min(parentDepth, childDepth + 1)) / maxDepth, 0.45, 1);

    if (childDepth < parentDepth) {
      // The family of someone's parents: a bough rises from the child to the fork and splits to father and mother.
      // The bough thins from the child up to the fork; all that leaves the fork goes on from there.
      const c = depthOf(carrier.childId, 0);
      const w0 = gw(c);
      const line = bough(dropPoints(fork, carrier)).reverse();
      const w1 = gw(c + 0.5);
      addWood(line, w0, w1, hashSeed(conn.familyId));
      leafy(line, amount * 0.7, rnd, 0.12, 0.9);
      sprigsAlong(line, (t) => lerp(w0, w1, t), amount * 0.6, rnd);
      const union = unionOf.get(conn.familyId);
      tuft(fork, -Math.PI / 2, amount, seed(`fork:${conn.familyId}`));
      if (partners.length) {
        for (const id of partners) {
          const card = cardOf.get(id)!;
          const w = gw(depthOf(id, c + 1));
          const a = arm(fork, card);
          addWood(a, w1, w, hashSeed(id));
          leafy(a, amount, seed(`arm:${id}`), 0.1, 0.85);
          sprigsAlong(a, () => w, amount * 0.8, seed(`sprigs:${id}`));
        }
      } else if (union) {
        // Parents not known: the bough goes on up to the mark that stands for them.
        addWood(bough([fork, conn.stem]), w1, gw(c + 1), hashSeed(conn.familyId));
      }
      for (const d of children) {
        if (d === carrier) continue;
        const twig = bough(dropPoints(fork, d));
        addWood(twig, w1, gw(depthOf(d.childId, c + 1)), hashSeed(d.childId));
        leafy(twig, amount * 0.8, seed(`twig:${d.childId}`), 0.1, 0.9);
      }
    } else {
      // A family further from the trunk than its parents (an uncle's children): twigs hang from under the couple.
      const p = Number.isFinite(parentDepth) ? parentDepth : 1;
      const atFork = gw(p + 0.5);
      const stem = bough([conn.stem, fork]);
      addWood(stem, gw(p), atFork, hashSeed(conn.familyId));
      for (const d of children) {
        const twig = bough(dropPoints(fork, d));
        addWood(twig, atFork, gw(depthOf(d.childId, p + 1)), hashSeed(d.childId));
        leafy(twig, amount * 0.7, seed(`twig:${d.childId}`), 0.1, 0.9);
      }
    }
  }

  // Leafy sprigs over the cards up in the tree: a spray over those whose parents are not on
  // the page (the top of the crown), and a twig at each top corner of the others.
  for (const card of leafiness > 0 ? layout.cards : []) {
    const id = card.personId;
    if (descendants.has(id) || !depth.has(id)) continue;
    const rnd = seed(`top:${id}`);
    const amount = leafiness * clamp(0.4 + (0.6 * (depth.get(id) ?? 0)) / maxDepth, 0.4, 1);
    const w = Math.max(minW, Math.min(S * 0.02, gw(depthOf(id, 1)) * 0.35));
    if (index.parents(id).some((p) => cardOf.has(p.id))) {
      for (const side of [-1, 1]) {
        if (rnd() > 0.75 * amount) continue;
        const from = { x: card.x + card.w * (0.5 + side * 0.4), y: card.y + H * 0.25 };
        sprig(from, -Math.PI / 2 + side * (0.6 + rnd() * 0.3), H * (0.35 + rnd() * 0.25), w, amount, rnd);
      }
      continue;
    }
    const tufts = 3 + Math.floor(rnd() * 2);
    for (let i = 0; i < tufts; i++) {
      const x = card.x + card.w * (0.15 + (0.7 * i) / Math.max(1, tufts - 1)) + (rnd() - 0.5) * card.w * 0.1;
      const angle = -Math.PI / 2 + (i - (tufts - 1) / 2) * 0.5 + (rnd() - 0.5) * 0.3;
      sprig({ x, y: card.y + H * 0.2 }, angle, H * (0.5 + rnd() * 0.3), w, amount, rnd);
    }
  }

  // --- the trunk -------------------------------------------------------------------

  const couple = present.length === 2 ? index.familyBetween(present[0], present[1]) : undefined;
  const coupleUnion = couple ? unionOf.get(couple.id) : undefined;
  const focusCards = present.map((id) => cardOf.get(id)!);
  const top: Pt = coupleUnion
    ? { x: coupleUnion.cx, y: coupleUnion.cy }
    : { x: focusCards[0].x + focusCards[0].w / 2, y: focusCards[0].y + focusCards[0].h / 2 };
  const trunkW = S * 0.12;
  const bottom = Math.max(...focusCards.map((c) => c.y + c.h));
  const base: Pt = { x: top.x, y: Math.min(bottom + clamp(spaceBelow(bottom) * 0.55, H * 0.35, H * 1.3), room.y + room.h - H * 0.2) };
  const sway = trunkW * 0.1;
  const crown: Pt = { x: top.x, y: Math.min(...focusCards.map((c) => c.y)) + H * 0.45 };
  const trunkLine = cubic(base, { x: base.x + sway, y: lerp(base.y, crown.y, 0.35) }, { x: base.x - sway, y: lerp(base.y, crown.y, 0.7) }, crown, 16);
  const trunkWidth = (t: number) => trunkW * (1 + 0.55 * Math.pow(1 - t, 3));
  wood.push(outline(trunkLine, trunkWidth, 0.06, 1));
  bark.push(
    offsetLine(trunkLine, trunkWidth, 0.5, 0.05, 0.8),
    offsetLine(trunkLine, trunkWidth, -0.35, 0.1, 0.92),
    offsetLine(trunkLine, trunkWidth, 0.1, 0.25, 0.7),
    offsetLine(trunkLine, trunkWidth, -0.72, 0.02, 0.5),
  );
  // Behind the couple the trunk parts into a bough for each of them, which comes out at the top of their card.
  for (const card of focusCards) {
    const w = gw(0);
    const to = { x: card.x + card.w / 2, y: card.y - 1 };
    const line = cubic(crown, { x: crown.x, y: crown.y - H * 0.2 }, { x: to.x, y: to.y + H * 0.35 }, to, 10);
    addWood(line, trunkW * 0.7, w, hashSeed(card.personId));
  }

  // --- the roots: down to children and grandchildren ---------------------------------

  const placed = new Set<string>(present);

  const rootLine = (a: Pt, card: LayoutCard): Pt[] => {
    const entry = { x: card.x + card.w / 2, y: card.y };
    const centre = { x: entry.x, y: card.y + card.h / 2 };
    if (entry.y <= a.y + 4) return cubic(a, a, centre, centre, 8);
    const d = Math.hypot(entry.x - a.x, entry.y - a.y);
    const toward = normalize({ x: entry.x - a.x, y: entry.y - a.y });
    const leave = normalize({ x: toward.x * 0.85, y: toward.y * 0.85 + 0.15 });
    const c1 = { x: a.x + leave.x * d * 0.42, y: a.y + leave.y * d * 0.42 };
    const c2 = { x: entry.x, y: entry.y - Math.min(d * 0.4, (entry.y - a.y) * 0.8) };
    const line = cubic(a, c1, c2, entry, clamp(Math.round(d / 12), 12, 28));
    line.push(centre);
    return line;
  };

  const connectorOf = new Map(layout.connectors.map((c) => [c.familyId, c]));

  /**
   * Roots to a family's children on the page, and on to their children. They
   * start at `from` (`at` generations below the couple) when given: the foot of
   * the trunk. Otherwise they hang from the middle of the parents, under the
   * rings between them (under the one parent's card when the other is not on
   * the page), the way the family lines do.
   */
  const familyRoots = (family: Family, from?: Pt, at = 0): number => {
    const kids = family.children.map((c) => c.personId).filter((id) => cardOf.has(id) && !placed.has(id));
    if (!kids.length) return 0;
    kids.forEach((id) => placed.add(id));
    let start = from;
    let g = at;
    if (!start) {
      const parents = family.partners.filter((id) => cardOf.has(id));
      const p = Math.min(...parents.map((id) => depthOf(id, 1)));
      g = (Number.isFinite(p) ? p : 1) + 0.25;
      const conn = connectorOf.get(family.id);
      const card = cardOf.get(parents[0]);
      const top = conn ? conn.stem : card ? { x: card.x + card.w / 2, y: card.y + card.h / 2 } : undefined;
      if (!top) return 0;
      const under = conn ? conn.clearY : card!.y + card!.h;
      start = { x: top.x, y: under + clamp(spaceBelow(under) * 0.3, 6, H * 0.4) };
      addWood([top, start], gw(g - 0.25), gw(g), hashSeed(family.id));
    }
    for (const id of kids) {
      const line = rootLine(start, cardOf.get(id)!);
      addWood(line, gw(g), gw(Math.max(g, depthOf(id, g + 0.75))), hashSeed(id));
    }
    for (const id of kids) for (const f of index.partnerFamilies(id)) familyRoots(f);
    return kids.length;
  };

  // The couple's children grow from the foot of the trunk; children of the person in
  // the middle with another partner hang from under the rings of that couple.
  let rooted = 0;
  if (couple) rooted += familyRoots(couple, base, 0.25);
  for (const id of present) {
    for (const f of index.partnerFamilies(id)) {
      if (f === couple) continue;
      const other = f.partners.find((p) => p !== id);
      const withPartner = !!other && cardOf.has(other) && connectorOf.has(f.id);
      rooted += familyRoots(f, withPartner ? undefined : base, 0.25);
    }
  }
  const baseW = trunkWidth(0);

  // Where the trunk meets the ground it flares into a few short roots.
  const rnd = seed(`flare:${present.join(',')}`);
  const flares = rooted ? [-1, 1] : [-1, -0.45, 0.45, 1];
  for (const side of flares) {
    const angle = Math.PI / 2 - side * (rooted ? 1.25 : 0.95 + rnd() * 0.2);
    const l = fit(base, angle, S * (rooted ? 0.42 : 0.5) * (0.85 + rnd() * 0.3));
    if (l === null) continue;
    const from = { x: base.x + side * baseW * 0.18, y: base.y - baseW * 0.05 };
    const end = { x: from.x + Math.cos(angle) * l, y: from.y + Math.sin(angle) * l };
    const line = cubic(from, { x: from.x + side * l * 0.45, y: from.y + l * 0.02 }, { x: end.x - side * l * 0.2, y: end.y - l * 0.12 }, end, 12);
    const w0 = baseW * (rooted ? 0.42 : 0.38);
    wood.push(outline(line, (t) => lerp(w0, minW, Math.pow(t, 0.7)), 0.05, side));
  }

  // A lone person, with nobody above them: a few leafy twigs so the tree is still a tree.
  if (!layout.connectors.length && leafiness > 0) {
    const card = focusCards[0];
    const r = seed('lone');
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.45 + (r() - 0.5) * 0.2;
      sprig({ x: card.x + card.w * (0.25 + i * 0.125), y: card.y + H * 0.2 }, a, H * (0.6 + r() * 0.4), minW * 1.5, 1, r);
    }
  }

  return { wood, twigs, bark: bark.filter(Boolean), foliage, blooms };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function normalize(p: Pt): Pt {
  const d = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / d, y: p.y / d };
}

/** Turns an angle a share of the way towards another. */
function towards(a: number, target: number, share: number): number {
  let d = target - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * share;
}

function hashSeed(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  return h / 97;
}
