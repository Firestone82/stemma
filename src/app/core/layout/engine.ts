/**
 * Lays the tree out from top to bottom, and from there wherever there is room.
 *
 * The oldest couples stand at the top, a couple side by side, with their children below them; the direct
 * line of the couple the chart is drawn around runs down through it. Children with families of their own
 * stand side by side under their parents. Children with no other connection are stacked in a column, and so
 * are those whose only connection is a partner (the partner's card under theirs); when a row would be too
 * wide, the families are folded into such columns too, down a line with children on one or both sides.
 * Brothers and sisters of someone in the direct line hang along the line that comes down to that person,
 * or (for those at the outer ends) out at the side of the tree, beside their brother or sister.
 *
 * Families are slid up against each other outline to outline, with padding between them, so no card
 * overlaps another and no line crosses a card or another line. Someone who belongs in two places (they
 * married a relative, or descend from one couple twice) has one card and a stand-in at the other place,
 * instead of a line across the tree. How wide each kind of family may spread is the Shape, down to single
 * families (Shape.plans); fit.ts picks the one that suits a page.
 */
import { isBrokenUp, relationshipStatus } from '../model/relationship';
import { TreeIndex } from '../model/tree-index';
import { ChildRelation } from '../model/types';
import { Box, Contour } from './contour';
import { Group, Kid, Member, Structure, Unit, Up, buildStructures, ranksOf } from './structure';
import { LayoutCard, LayoutLine, LayoutOptions, LayoutPlaceholder, LayoutResult, LayoutUnion, Pt, Shape } from './types';

/** Clear space a line keeps around itself. */
const LINE_PAD = 4;
/** How far the line between partners who do not stand next to each other rises over the cards between them. */
const BRIDGE = 14;
/** The most lists side by side one family's children are folded into. */
const MAX_COLUMNS = 8;

/** Between the lines that join the couples of someone with several partners, when they are stacked in a column. */
const LANE = 14;

type Facing = 'top' | 'west' | 'east';
type Side = 'L' | 'R';

/** Whether the tree is free to grow out to the left and right of a unit: nothing of the direct line stands there. */
interface Open {
  L: boolean;
  R: boolean;
}
const CLOSED: Open = { L: false, R: false };

/** Brothers and sisters waiting to be hung out at the side of the tree, once the direct line stands. */
interface Wing {
  sides: Open;
  group: Group;
  /** The line from the parents down to where the bar to the wing leaves it. */
  head: Pt[];
  rank: number;
}

/** A piece of the chart in its own coordinates, moved as one. */
class Block {
  cards: LayoutCard[] = [];
  unions: LayoutUnion[] = [];
  lines: LayoutLine[] = [];
  holders: LayoutPlaceholder[] = [];
  boxes: Box[] = [];
  wings: Wing[] = [];
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;

  box(x0: number, y0: number, x1: number, y1: number, pad: number): void {
    this.boxes.push({ x0, y0, x1, y1, pad });
    if (x0 < this.x0) this.x0 = x0;
    if (y0 < this.y0) this.y0 = y0;
    if (x1 > this.x1) this.x1 = x1;
    if (y1 > this.y1) this.y1 = y1;
  }

  /** Keeps other things off a line. */
  path(points: readonly Pt[]): void {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      this.box(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), LINE_PAD);
    }
  }

  /** Takes a copy of `o`, moved by (dx, dy). */
  merge(o: Block, dx: number, dy: number): void {
    for (const c of o.cards) this.cards.push({ ...c, x: c.x + dx, y: c.y + dy });
    for (const u of o.unions) this.unions.push({ ...u, x: u.x + dx, y: u.y + dy, line: move(u.line, dx, dy) });
    for (const l of o.lines) this.lines.push({ ...l, points: move(l.points, dx, dy) });
    for (const h of o.holders) this.holders.push({ ...h, x: h.x + dx, y: h.y + dy });
    for (const b of o.boxes) this.box(b.x0 + dx, b.y0 + dy, b.x1 + dx, b.y1 + dy, b.pad);
    for (const w of o.wings) this.wings.push({ ...w, head: move(w.head, dx, dy) });
  }

  /** The same piece seen in a mirror: left and right swapped. */
  mirrored(): Block {
    const m = new Block();
    const flip = (points: readonly Pt[]) => points.map((p) => ({ x: -p.x, y: p.y }));
    for (const c of this.cards) m.cards.push({ ...c, x: -(c.x + c.w) });
    for (const u of this.unions) m.unions.push({ ...u, x: -u.x, line: flip(u.line) });
    for (const l of this.lines) m.lines.push({ ...l, points: flip(l.points) });
    for (const h of this.holders) m.holders.push({ ...h, x: -(h.x + h.w) });
    for (const b of this.boxes) m.box(-b.x1, b.y0, -b.x0, b.y1, b.pad);
    return m;
  }
}

function move(points: readonly Pt[], dx: number, dy: number): Pt[] {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** A line's points without repeats and without points in the middle of a straight run. */
function tidy(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const a = out[out.length - 1];
    if (a && Math.abs(a.x - p.x) < 0.01 && Math.abs(a.y - p.y) < 0.01) continue;
    const b = out[out.length - 2];
    if (a && b && ((Math.abs(a.x - b.x) < 0.01 && Math.abs(a.x - p.x) < 0.01) || (Math.abs(a.y - b.y) < 0.01 && Math.abs(a.y - p.y) < 0.01))) out.pop();
    out.push(p);
  }
  return out;
}

interface Ctx {
  o: LayoutOptions;
  index: TreeIndex;
  shape: Shape;
  /** Families hung below someone, by unit, the way they face and the width they may take. */
  memo: Map<string, UnitBlock>;
  /** The arrangements chosen by hand (Shape.plans) among the families at and below a unit, as text: part of what a made piece depends on. */
  chosen: (u: Unit) => string;
  /** Set when a family was asked for an arrangement it does not have. */
  missed: { plan: boolean };
}

interface Stem {
  familyId: string;
  /** Where the line to the children leaves the unit's foot. */
  x: number;
  /** From the marker (or the card's foot) to there. */
  head: Pt[];
}

interface UnitBlock {
  block: Block;
  /** Where the line from the parents meets the card of the one born into the family. */
  access: Pt;
  /**
   * At the side of a line, when a partner stands between the line and that card: the height at which the line
   * comes across, over the partner, before it drops onto the card's top at `access`.
   */
  via?: number;
  /** One card and nothing else. */
  leaf: boolean;
  /** A couple with nothing else, stacked: stands close to its neighbours in a column. */
  tight?: boolean;
}

interface UnitCore {
  block: Block;
  stems: Map<string, Stem>;
  access: Pt;
  via?: number;
}

/** A unit's cards and markers on their own. */
interface UnitRow extends UnitCore {
  /** Where each of its people stands in the row, from the left. */
  at: Map<string, number>;
  xOf: (i: number) => number;
  /** How wide the card there is. */
  wOf: (i: number) => number;
  /** The one born into the family the unit hangs from. */
  blood: number;
  /** A line between partners passes over the cards between them. */
  bridged: boolean;
  /** Or under them. */
  under: boolean;
}

/**
 * Someone's other partners from the nearest outwards, each followed by their own other partners. Those
 * with parents standing above them (or above anyone who came with them) go last, at the outer end, so
 * that the line from the person to a partner further out does not pass over a card with a line coming
 * down to it.
 */
function outward(u: Unit, core: Member, extras: Member[]): Member[][] {
  const groups: Member[][] = [];
  for (const m of extras) {
    const own = !m.of || m.of === core.personId ? undefined : groups.find((g) => g.some((x) => x.personId === m.of));
    if (own) own.push(m);
    else groups.push([m]);
  }
  const above = new Set(u.ups.map((up) => up.personId));
  const has = (g: Member[]) => g.some((m) => above.has(m.personId));
  return [...groups.filter((g) => !has(g)), ...groups.filter(has)];
}

/**
 * The people of a unit from left to right. Someone with several partners stands between them: the latest on
 * the right, the earlier ones on the left. At the side of a line that is so only with `amid`; otherwise the
 * partners there all stand beyond the person, away from the line.
 */
function rowOf(u: Unit, facing: Facing, amid: boolean): Member[] {
  if (!u.core.length) return [];
  const rev = (m: Member[]) => [...m].reverse();
  if (u.core.length === 2) return [...rev(outward(u, u.core[0], u.extras[0]).flat()), u.core[0], u.core[1], ...outward(u, u.core[1], u.extras[1]).flat()];
  const groups = outward(u, u.core[0], u.extras[0]);
  const between = amid && groups.length > 1 && !u.ups.length;
  if (facing === 'west' && !between) return [u.core[0], ...groups.flat()];
  if (facing === 'east' && !between) return [...rev(groups.flat()), u.core[0]];
  // The latest partner on the right, the earlier ones on the left.
  const latest = u.extras[0][0];
  const right = groups.find((g) => g[0] === latest) ?? [];
  return [...rev(groups.filter((g) => g !== right).flat()), u.core[0], ...right];
}

/** How much more room someone's card keeps round it (LayoutOptions.halo). */
function haloOf(ctx: Ctx, personId: string): number {
  const h = ctx.o.halo;
  return h && h.ids.includes(personId) ? h.pad : 0;
}

/** How wide someone's card is: the one width, unless theirs was given another (LayoutOptions.widths). */
function widthOf(ctx: Ctx, personId: string): number {
  return ctx.o.widths?.[personId] ?? ctx.o.cardWidth;
}

/** The people of a unit in a row or a column, turned over where an odd number of them asked for it (LayoutOptions.flipped). */
function flip(ctx: Ctx, row: Member[]): Member[] {
  const asked = ctx.o.flipped;
  if (!asked?.length || row.length < 2) return row;
  const turned = row.filter((m) => !m.ghost && asked.includes(m.personId)).length % 2 === 1;
  return turned ? [...row].reverse() : row;
}

/** A unit's cards and the markers between partners. */
function unitRow(ctx: Ctx, u: Unit, facing: Facing): UnitRow {
  const { cardWidth: W, cardHeight: H, partnerGap: G, siblingGap } = ctx.o;
  const pad = siblingGap / 2;
  const block = new Block();
  const row = flip(ctx, rowOf(u, facing, ctx.o.amidPartners));
  const at = new Map(row.map((m, i) => [m.personId, i]));
  // Each card as wide as it is, the same gap between any two.
  const widths = row.map((m) => widthOf(ctx, m.personId));
  const lefts: number[] = [];
  widths.reduce((x, w) => (lefts.push(x), x + w + G), 0);
  const xOf = (i: number) => lefts[i] ?? 0;
  const wOf = (i: number) => widths[i] ?? W;
  const stems = new Map<string, Stem>();

  if (u.placeholder) {
    block.holders.push({ familyId: u.placeholder, x: 0, y: 0, w: W, h: H });
    block.box(0, 0, W, H, pad);
    stems.set(u.placeholder, { familyId: u.placeholder, x: W / 2, head: [{ x: W / 2, y: H }] });
  }
  row.forEach((m, i) => {
    block.cards.push({
      key: m.ghost ? `${m.personId}~u${u.id}` : m.personId,
      personId: m.personId,
      x: xOf(i),
      y: 0,
      w: wOf(i),
      h: H,
      ghost: m.ghost || undefined,
    });
    block.box(xOf(i), 0, xOf(i) + wOf(i), H, pad + haloOf(ctx, m.personId));
  });
  let bridged = false;
  let passedUnder = false;
  // Couples who stand next to each other first: the marker between their cards.
  const pairs: { f: (typeof u.families)[number]; a: number; b: number }[] = [];
  const gapTaken = new Set<number>();
  const withKids = new Set(u.groups.map((g) => g.familyId));
  for (const f of u.families) {
    if (f.id === u.placeholder) continue;
    const idx = f.partners
      .map((p) => at.get(p))
      .filter((i): i is number => i !== undefined)
      .sort((a, b) => a - b);
    if (!idx.length) continue;
    if (idx.length === 1) {
      const x = xOf(idx[0]) + wOf(idx[0]) / 2;
      stems.set(f.id, { familyId: f.id, x, head: [{ x, y: H }] });
      continue;
    }
    const [a, b] = idx;
    if (b !== a + 1) {
      pairs.push({ f, a, b });
      continue;
    }
    gapTaken.add(a);
    const x = xOf(a) + wOf(a) + G / 2;
    block.unions.push({
      familyId: f.id,
      kind: f.kind,
      ended: isBrokenUp(relationshipStatus(f)),
      x,
      y: H / 2,
      line: [
        { x: xOf(a) + wOf(a), y: H / 2 },
        { x: xOf(b), y: H / 2 },
      ],
    });
    stems.set(f.id, {
      familyId: f.id,
      x,
      head: [
        { x, y: H / 2 },
        { x, y: H },
      ],
    });
  }
  // Then those with someone between them: the line goes round the cards between, over them, or under them
  // when someone it would pass over has parents above (and nobody it would pass under has children below).
  const hasUps = new Set(u.ups.map((up) => up.personId));
  for (const { f, a, b } of pairs) {
    const between = row.slice(a + 1, b);
    const under =
      between.some((m) => hasUps.has(m.personId)) &&
      !u.families.some(
        (g) => g !== f && withKids.has(g.id) && stems.has(g.id) && stems.get(g.id)!.x > xOf(a) + wOf(a) * 0.75 && stems.get(g.id)!.x < xOf(b) + wOf(b) * 0.25,
      );
    // The marker in a gap of its own: beside whichever of the two has no partner on that side.
    const gap = gapTaken.has(b - 1) ? a : b - 1;
    gapTaken.add(gap);
    const x = xOf(gap) + wOf(gap) + G / 2;
    const from = xOf(a) + wOf(a) * 0.75;
    const to = xOf(b) + wOf(b) * 0.25;
    const edge = under ? H : 0;
    const y = under ? H + BRIDGE : -BRIDGE;
    if (under) passedUnder = true;
    else bridged = true;
    const line = [
      { x: from, y: edge },
      { x: from, y },
      { x: to, y },
      { x: to, y: edge },
    ];
    block.unions.push({ familyId: f.id, kind: f.kind, ended: isBrokenUp(relationshipStatus(f)), x, y, line });
    block.path(line);
    stems.set(f.id, {
      familyId: f.id,
      x,
      head: under
        ? [{ x, y }]
        : [
            { x, y },
            { x, y: H },
          ],
    });
  }

  const blood = u.core.length === 1 ? (at.get(u.core[0].personId) ?? 0) : 0;
  let access: Pt =
    facing === 'west' ? { x: xOf(blood), y: H / 2 } : facing === 'east' ? { x: xOf(blood) + wOf(blood), y: H / 2 } : { x: xOf(blood) + wOf(blood) / 2, y: 0 };
  let via: number | undefined;
  if (u.core.length === 1 && (facing === 'west' ? blood > 0 : facing === 'east' && blood < row.length - 1)) {
    // A partner stands between the line and the person: the line comes across over that partner (and over any
    // line between partners that passes there) and drops onto the middle of the person's card.
    via = -BRIDGE - (bridged ? BRIDGE - LINE_PAD : 0);
    access = { x: xOf(blood) + wOf(blood) / 2, y: 0 };
    block.path([{ x: facing === 'west' ? 0 : xOf(row.length - 1) + wOf(row.length - 1), y: via }, { x: access.x, y: via }, access]);
  }
  return { block, stems, access, via, at, xOf, wOf, blood, bridged, under: passedUnder };
}

/** A unit's cards and markers, with everyone's parents above; the children are hung by the caller. */
function unitCore(ctx: Ctx, u: Unit, facing: Facing, hung: boolean, open: Open = CLOSED, level = 0): UnitCore {
  const { block, stems, access, via, at, xOf, wOf, blood, bridged } = unitRow(ctx, u, facing);

  // Parents above: each on the line down to their child, slid apart where they would run into each other.
  const all = u.ups
    .map((up) => ({ up, i: at.get(up.personId) }))
    .filter((e): e is { up: Up; i: number } => e.i !== undefined)
    .sort((a, b) => a.i - b.i);
  const ups = all;
  if (ups.length) {
    const baseY = -ctx.o.drop - (bridged ? BRIDGE + LINE_PAD : 0);
    const perMember = new Map<number, number>();
    for (const e of ups) perMember.set(e.i, (perMember.get(e.i) ?? 0) + 1);
    const seen = new Map<number, number>();
    interface Above {
      target: number;
      block: Block;
      head?: Pt[];
      up?: Up;
      x: number;
    }
    const above: Above[] = ups.map((e, j) => {
      const k = (seen.get(e.i) ?? 0) + 1;
      seen.set(e.i, k);
      // The parents of someone who hangs from another family above (birth and adoptive parents) stand to the
      // side of the line they hang by, which keeps the middle of the card.
      const own = hung && facing === 'top' && u.core.length === 1 && e.i === blood;
      const target = own ? xOf(e.i) + wOf(e.i) * (k % 2 ? 0.82 : 0.18) : xOf(e.i) + (wOf(e.i) * k) / (perMember.get(e.i)! + 1);
      const r = upBlock(ctx, e.up, j === 0 ? 'L' : 'R', { L: e === all[0] && open.L, R: e === all[all.length - 1] && open.R }, level + 1);
      return { target, block: r.block, head: r.head, up: e.up, x: target };
    });
    // A unit hung from above keeps the way down to its card clear.
    if (hung && facing === 'top' && u.core.length === 1) {
      const way = new Block();
      way.box(0, -100000, 0, 0, LINE_PAD);
      above.push({ target: access.x, block: way, x: access.x });
      above.sort((a, b) => a.target - b.target);
    }
    const gap = ctx.o.familyGap - ctx.o.siblingGap;
    const seps: number[] = [];
    for (let j = 1; j < above.length; j++) {
      const need = Contour.of(above[j - 1].block.boxes).pushRight(Contour.of(above[j].block.boxes));
      seps.push(Number.isFinite(need) ? need + gap : -Infinity);
    }
    for (let j = 1; j < above.length; j++) above[j].x = Math.max(above[j].target, above[j - 1].x + seps[j - 1]);
    // Pushed apart evenly, not all to the right; but the way down to a card hung from above stays where it is.
    const fixedWay = above.find((a) => !a.up);
    const drift = fixedWay ? fixedWay.x - fixedWay.target : above.reduce((s, a) => s + (a.x - a.target), 0) / above.length;
    for (const a of above) a.x -= drift;
    for (const a of above) {
      if (!a.up || !a.head) continue;
      block.merge(a.block, a.x, baseY);
      const tail = [
        { x: a.x, y: baseY },
        { x: a.target, y: baseY },
        { x: a.target, y: 0 },
      ];
      block.path(tail);
      block.lines.push({
        key: `${a.up.familyId}|${a.up.personId}`,
        familyId: a.up.familyId,
        childId: a.up.personId,
        relation: a.up.relation,
        trunk: a.up.parents.trunk,
        points: tidy([...move(a.head, a.x, baseY), ...tail]),
      });
    }
  }
  return { block, stems, access, via };
}

interface GroupOpt {
  /** Where the line from the parents arrives: over the middle, the first or last list, or the list the trunk runs down. */
  attach: 'centre' | 'first' | 'last' | 'main';
  /** The side a single list hangs to. */
  outer: Side;
  /** The line runs on down the main list, to the next generation. */
  pass?: boolean;
  /** Always lists down a line, never a row: under a couple who stand one over the other. */
  lists?: boolean;
  /** From where the line arrives down to the bar. */
  stem: number;
}

interface GroupResult {
  block: Block;
  /** The children's lines from where the group's line arrives (0,0), still to be joined to the parents. */
  lines: LayoutLine[];
  width: number;
}

interface Hung {
  stem: Stem;
  res: GroupResult;
  /** Stays right under its stem; the others make room, all the way down: its line runs on below it. */
  fixed?: boolean;
}

/** Hangs groups of children under a unit, each from its stem, moved aside where they would run into each other. */
function hang(ctx: Ctx, block: Block, items: Hung[], H = ctx.o.cardHeight): void {
  if (!items.length) return;
  const gap = ctx.o.familyGap - ctx.o.siblingGap;
  items.sort((a, b) => a.stem.x - b.stem.x);
  const fixed = items.findIndex((i) => i.fixed);
  const pivot = fixed >= 0 ? fixed : Math.floor((items.length - 1) / 2);
  const shift = new Array<number>(items.length).fill(0);
  const cont = new Contour();
  cont.add(items[pivot].res.block.boxes, items[pivot].stem.x, H);
  if (fixed >= 0) {
    const lowest = items.reduce((y, i) => Math.max(y, Number.isFinite(i.res.block.y1) ? i.res.block.y1 : 0), 0);
    cont.span(items[pivot].stem.x - LINE_PAD, items[pivot].stem.x + LINE_PAD, H, H + lowest + 40);
  }
  for (let i = pivot + 1; i < items.length; i++) {
    const need = cont.pushRight(Contour.of(items[i].res.block.boxes, items[i].stem.x, H));
    shift[i] = Number.isFinite(need) ? Math.max(0, need + gap) : 0;
    cont.add(items[i].res.block.boxes, items[i].stem.x + shift[i], H);
  }
  for (let i = pivot - 1; i >= 0; i--) {
    const need = cont.pushLeft(Contour.of(items[i].res.block.boxes, items[i].stem.x, H));
    shift[i] = Number.isFinite(need) ? -Math.max(0, need + gap) : 0;
    cont.add(items[i].res.block.boxes, items[i].stem.x + shift[i], H);
  }
  // Two families under one unit make room for each other evenly.
  if (fixed < 0 && items.length === 2 && shift[1] > 0) {
    shift[0] = -shift[1] / 2;
    shift[1] = shift[1] / 2;
  }
  items.forEach((item, i) => {
    const x = item.stem.x + shift[i];
    block.merge(item.res.block, x, H);
    const jog = shift[i]
      ? [
          { x: item.stem.x, y: H + ctx.o.stem },
          { x, y: H + ctx.o.stem },
        ]
      : [];
    if (jog.length) block.path([{ x: item.stem.x, y: H }, ...jog]);
    for (const l of item.res.lines) {
      block.lines.push({ ...l, points: tidy([...item.stem.head, ...jog, ...move(shift[i] ? jogged(l.points, ctx.o.stem) : l.points.slice(1), x, H)]) });
    }
  });
}

/** A group's line from under a sideways step at `y`: without the way straight down to there. */
function jogged(points: readonly Pt[], y: number): Pt[] {
  const rest = points.slice(1);
  return rest.length && rest[0].x === 0 && rest[0].y <= y ? rest.slice(1) : rest;
}

/** A unit with everything that hangs from it and stands above it. */
function unitBlock(ctx: Ctx, u: Unit, facing: Facing, budget: number, hung: boolean, open: Open = CLOSED): UnitBlock {
  const core = unitCore(ctx, u, facing, hung, open, 0);
  const groups = u.groups.filter((g) => core.stems.has(g.familyId));
  const each = Number.isFinite(budget) ? budget / Math.max(1, groups.length) : Infinity;
  const outer: Side = facing === 'east' ? 'L' : 'R';
  hang(
    ctx,
    core.block,
    groups.map((g) => ({ stem: core.stems.get(g.familyId)!, res: groupBlock(ctx, g, each, { attach: 'centre', outer, stem: ctx.o.stem }) })),
  );
  return {
    block: core.block,
    access: core.access,
    via: core.via,
    leaf: core.block.cards.length === 1 && !groups.length && core.block.y0 >= -0.5,
    // A couple with nobody under or over them stands close to its neighbours in a column, like a couple stacked.
    tight: core.block.cards.length > 1 && !groups.length && !u.ups.length,
  };
}

/** The family of a child off the trunk, as it hangs from a row (top) or from a line at its side. */
function kidBlock(ctx: Ctx, familyId: string, kid: Kid, facing: Facing, budget: number): UnitBlock {
  const { cardWidth: W, cardHeight: H, siblingGap } = ctx.o;
  if (!kid.unit) {
    const block = new Block();
    const w = widthOf(ctx, kid.personId);
    block.cards.push({ key: `${kid.personId}~${familyId}`, personId: kid.personId, x: 0, y: 0, w, h: H, ghost: true });
    block.box(0, 0, w, H, siblingGap / 2);
    return { block, access: facing === 'west' ? { x: 0, y: H / 2 } : facing === 'east' ? { x: w, y: H / 2 } : { x: w / 2, y: 0 }, leaf: true };
  }
  if (facing !== 'top' && ctx.o.stackCouples && stackable(kid) && kid.unit.core.length === 1 && kid.unit.extras[0].length === 1) {
    const key = `${kid.unit.id}:${facing}:s`;
    let made = ctx.memo.get(key);
    if (!made) ctx.memo.set(key, (made = stackedCouple(ctx, kid.unit, facing)));
    return made;
  }
  const q = Number.isFinite(budget) ? Math.max(1, Math.floor(budget / (W / 2))) : 0;
  const key = `${kid.unit.id}:${facing}:${q}${ctx.chosen(kid.unit)}`;
  let made = ctx.memo.get(key);
  if (!made) {
    made = unitBlock(ctx, kid.unit, facing, q ? q * (W / 2) : Infinity, true);
    ctx.memo.set(key, made);
  }
  return made;
}

/** A child with no other connection, or whose only connection is a partner: stacked in a column with the others like them. */
function stackable(kid: Kid): boolean {
  if (!kid.unit) return true;
  return !kid.unit.groups.length && !kid.unit.ups.length;
}

interface Spine {
  kids: Kid[];
  sides: 'drop' | 'both' | Side;
}

/**
 * The ways a family's children can be arranged, widest first: all side by side; those with families of
 * their own side by side and the rest stacked in a column beside them (two columns with the line between
 * them, or one); then everyone in columns, fewer and fewer.
 */
function plans(ctx: Ctx, g: Group, opt: GroupOpt): Spine[][] {
  const n = g.kids.length;
  const lists = !!opt.pass || !!opt.lists;
  const out: Spine[][] = [];
  const alone = (k: Kid): Spine => ({ kids: [k], sides: 'drop' });
  if (!lists) {
    out.push(g.kids.map(alone));
    const stack = g.kids.filter((k) => stackable(k));
    const families = g.kids.filter((k) => !stackable(k));
    if (families.length && stack.length >= 2) {
      out.push([...families.map(alone), { kids: stack, sides: 'both' }]);
      out.push([...families.map(alone), { kids: stack, sides: opt.outer }]);
    }
  }
  const columns: number[] = [];
  for (let c = Math.min(2 * Math.ceil(n / 2), MAX_COLUMNS); c >= 2; c -= 2) if (lists || c < n) columns.push(c);
  if (n > 1 || lists) columns.push(1);
  for (const c of columns) {
    const count = Math.ceil(c / 2);
    const perColumn = Math.ceil(n / c);
    const rest = [...g.kids];
    const spines: Spine[] = [];
    for (let s = 0; s < count && rest.length; s++) {
      const cols = s === count - 1 && c % 2 === 1 ? 1 : 2;
      const take = s === count - 1 ? rest.length : Math.min(rest.length, cols * perColumn);
      const kids = rest.splice(0, take);
      // An only child hangs straight under the line, unless the line runs on down past it.
      spines.push({ kids, sides: kids.length === 1 && !lists ? 'drop' : cols === 2 ? 'both' : opt.outer });
    }
    out.push(spines);
  }
  return out;
}

/** A family's children, as wide as `budget` allows. */
function groupBlock(ctx: Ctx, g: Group, budget: number, opt: GroupOpt): GroupResult {
  const all = plans(ctx, g, opt);
  // Chosen by hand for this family (see Shape.plans), whatever the width.
  const chosen = ctx.shape.plans?.get(g.familyId);
  if (chosen !== undefined) {
    if (typeof chosen === 'number' && chosen >= all.length) ctx.missed.plan = true;
    // By name: the row is the first, one column the last, and a line with children down both sides the one before it.
    const at = chosen === 'row' ? 0 : chosen === 'column' ? all.length - 1 : chosen === 'columns' ? all.length - 2 : chosen;
    return arrange(ctx, g, all[Math.max(0, Math.min(at, all.length - 1))], budget, opt);
  }
  let last: GroupResult | undefined;
  for (const spines of all) {
    last = arrange(ctx, g, spines, budget, opt);
    if (last.width <= budget) return last;
  }
  return last!;
}

function arrange(ctx: Ctx, g: Group, plan: Spine[], budget: number, opt: GroupOpt): GroupResult {
  const { cardWidth: W, siblingGap, familyGap, tick } = ctx.o;
  const spines = [...plan];
  // The eldest hang nearest to where the line arrives.
  if (opt.attach === 'last' || (opt.attach === 'main' && opt.outer === 'L')) spines.reverse();
  const main = opt.attach === 'last' || (opt.attach === 'main' && opt.outer === 'L') ? spines.length - 1 : 0;
  const multi = spines.length > 1;
  const barY = multi ? opt.stem : 0;
  const firstTop = opt.stem + ctx.o.drop;
  // The width is shared out among the columns: a child alone under the line has one, a line with children on both sides two.
  const columns = spines.reduce((sum, sp) => sum + (sp.sides === 'both' ? 2 : 1), 0);
  const kidBudget = Number.isFinite(budget) ? Math.max(W, (budget - spines.length * 2 * tick - (spines.length - 1) * familyGap) / columns) : Infinity;

  const block = new Block();
  const lines: LayoutLine[] = [];
  const cont = new Contour();
  const xs: number[] = [];
  let prevLeaf = true;
  const built = spines.map((sp) => spineBlock(ctx, g.familyId, sp, kidBudget, barY, firstTop));
  if (opt.pass) {
    // The line runs on below the last child, past everything in the other lists.
    const lowest = built.reduce((y, b) => Math.max(y, Number.isFinite(b.block.y1) ? b.block.y1 : 0), 0);
    built[main].block.path([
      { x: 0, y: barY },
      { x: 0, y: lowest },
    ]);
  }
  built.forEach((b, s) => {
    let x = 0;
    if (s > 0) {
      const need = cont.pushRight(Contour.of(b.block.boxes));
      x = (Number.isFinite(need) ? need : xs[s - 1]) + (prevLeaf && b.leaf ? 0 : familyGap - siblingGap);
    }
    xs.push(x);
    cont.add(b.block.boxes, x, 0);
    prevLeaf = b.leaf;
  });
  const ox = opt.attach === 'centre' ? (xs[0] + xs[xs.length - 1]) / 2 : xs[opt.attach === 'first' ? 0 : main];
  const pos = xs.map((x) => x - ox);
  built.forEach((b, s) => {
    const x = pos[s];
    block.merge(b.block, x, 0);
    for (const l of b.lines) {
      lines.push({
        ...l,
        points: tidy([{ x: 0, y: 0 }, { x: 0, y: barY }, ...move(l.points, x, 0)]),
      });
    }
  });
  if (multi) {
    block.path([
      { x: Math.min(0, pos[0]), y: barY },
      { x: Math.max(0, pos[pos.length - 1]), y: barY },
    ]);
    if (barY > 0)
      block.path([
        { x: 0, y: 0 },
        { x: 0, y: barY },
      ]);
  }
  return { block, lines, width: block.x1 - block.x0 };
}

/** One line of children: a single child straight under it, or children down one or both of its sides. */
function spineBlock(
  ctx: Ctx,
  familyId: string,
  sp: Spine,
  budget: number,
  barY: number,
  firstTop: number,
): { block: Block; lines: LayoutLine[]; leaf: boolean } {
  const { siblingGap, familyGap, tick } = ctx.o;
  const block = new Block();
  const lines: LayoutLine[] = [];
  const line = (kid: Kid, points: Pt[]) =>
    lines.push({ key: `${familyId}|${kid.personId}`, familyId, childId: kid.personId, relation: kid.relation as ChildRelation, trunk: false, points });
  if (sp.sides === 'drop') {
    const kid = sp.kids[0];
    const kb = kidBlock(ctx, familyId, kid, 'top', budget);
    // Parents of someone who married in stand above the row: the child hangs lower, under them.
    const lower = kb.block.y0 < -0.5 ? -kb.block.y0 + siblingGap : 0;
    block.merge(kb.block, -kb.access.x, firstTop + lower - kb.access.y);
    const way = [
      { x: 0, y: barY },
      { x: 0, y: firstTop + lower },
    ];
    block.path(way);
    line(kid, way);
    return { block, lines, leaf: kb.leaf };
  }
  const cursor = { L: firstTop, R: firstTop };
  let lowest = barY;
  for (const kid of sp.kids) {
    const side: Side = sp.sides === 'both' ? (cursor.L <= cursor.R ? 'L' : 'R') : sp.sides;
    const kb = kidBlock(ctx, familyId, kid, side === 'L' ? 'east' : 'west', budget);
    // Whatever of the family reaches past the card towards the line pushes the card further out.
    const over = side === 'L' ? kb.block.x1 - kb.access.x : kb.access.x - kb.block.x0;
    const out = tick + (over > 0.5 ? over + LINE_PAD * 2 : 0);
    const dx = side === 'L' ? -out - kb.access.x : out - kb.access.x;
    const dy = cursor[side] - kb.block.y0;
    block.merge(kb.block, dx, dy);
    // Straight across to the card's side, or (a partner in the way) across over the partner and down onto the card.
    const y = (kb.via ?? kb.access.y) + dy;
    const end = { x: kb.access.x + dx, y: kb.access.y + dy };
    const way = kb.via === undefined ? [{ x: 0, y }, end] : [{ x: 0, y }, { x: end.x, y }, end];
    block.path(way);
    line(kid, [{ x: 0, y: barY }, ...way]);
    cursor[side] = kb.block.y1 + dy + (kb.leaf ? siblingGap : kb.tight ? siblingGap * 1.5 : familyGap);
    lowest = Math.max(lowest, y);
  }
  block.path([
    { x: 0, y: barY },
    { x: 0, y: lowest },
  ]);
  return { block, lines, leaf: false };
}

/**
 * The parents of someone, above them, with everything above those parents, and their other children hung
 * along the line that comes down (or left for the side of the tree, see Wing). In its own coordinates the
 * line ends at (0,0), and everything is above it.
 */
function upBlock(ctx: Ctx, up: Up, side: Side, open: Open, level: number): { block: Block; head: Pt[] } {
  const { cardWidth: W, cardHeight: H, stem, siblingGap } = ctx.o;
  const pa = up.parents;
  // The oldest couple of a line, with nobody above them, may stand one over the other: half as wide.
  const stacked =
    ctx.shape.stack && ctx.o.stackCouples && pa.trunk && !pa.ups.length && pa.core.length === 2 && pa.extras.every((e) => !e.length)
      ? stackCore(ctx, pa)
      : undefined;
  const core = stacked ? { block: stacked.block, stems: stacked.stems, access: { x: stacked.width / 2, y: 0 } } : unitCore(ctx, pa, 'top', false, open, level);
  const base = stacked ? stacked.foot : H;
  const way = core.stems.get(up.familyId) ?? { familyId: up.familyId, x: core.access.x, head: [{ x: core.access.x, y: base }] };
  const bands = ctx.shape.bands;
  const budget = pa.trunk ? (bands[Math.min(level, bands.length) - 1] ?? Infinity) : 2 * W + ctx.o.partnerGap + 2 * ctx.o.tick;
  const siblings = pa.groups.find((g) => g.familyId === up.familyId);
  const wing: Open = { L: open.L && ctx.shape.flankL === 'wing', R: open.R && ctx.shape.flankR === 'wing' };
  const winged = !!siblings && pa.trunk && (wing.L || wing.R);
  const items: Hung[] = [];
  const along =
    siblings && !winged ? groupBlock(ctx, siblings, budget, { attach: 'main', outer: side, pass: true, stem }) : { block: new Block(), lines: [], width: 0 };
  // The line itself, so that nothing else under these parents hangs across it.
  along.block.path([
    { x: 0, y: 0 },
    { x: 0, y: Math.max(stem, Number.isFinite(along.block.y1) ? along.block.y1 : 0) },
  ]);
  items.push({ stem: way, res: along, fixed: true });
  for (const g of pa.groups) {
    if (g === siblings || !core.stems.has(g.familyId)) continue;
    items.push({ stem: core.stems.get(g.familyId)!, res: groupBlock(ctx, g, budget, { attach: 'centre', outer: side, stem }) });
  }
  hang(ctx, core.block, items, base);
  const foot = Math.max(base + stem, core.block.y1 + siblingGap / 2 + LINE_PAD);
  core.block.path([
    { x: way.x, y: base },
    { x: way.x, y: foot },
  ]);
  const head = move([...way.head, { x: way.x, y: foot }], -way.x, -foot);
  const block = new Block();
  block.merge(core.block, -way.x, -foot);
  if (winged && siblings) block.wings.push({ sides: wing, group: siblings, head, rank: pa.rank });
  return { block, head };
}

interface Stack {
  block: Block;
  stems: Map<string, Stem>;
  /** Where each family's line to the next generation in starts: its marker. */
  anchors: Map<string, Pt>;
  foot: number;
  /** How wide the column's cards are. */
  width: number;
  /** The height of the middle of the first of the couple's card: where a line from the side meets it. */
  top: number;
}

/**
 * A couple one over the other: the cards in a column, joined down their right side, where the marker sits.
 */
function stackCore(ctx: Ctx, u: Unit): Stack {
  const { cardHeight: H, tick, siblingGap, stackGap } = ctx.o;
  const pad = siblingGap / 2;
  const block = new Block();
  const rev = (m: Member[]) => [...m].reverse();
  // Someone with several partners stands between them, so each couple's cards are next to each other.
  const order: Member[] = flip(
    ctx,
    u.core.length === 2
      ? [...rev(u.extras[0]), u.core[0], u.core[1], ...u.extras[1]]
      : u.core.length === 1
        ? [...rev(u.extras[0].slice(1)), u.core[0], ...u.extras[0].slice(0, 1)]
        : [],
  );
  const at = new Map(order.map((m, i) => [m.personId, i]));
  // The cards of a column are one width: that of the widest among them.
  const W = order.length ? Math.max(...order.map((m) => widthOf(ctx, m.personId))) : ctx.o.cardWidth;
  const mid = (i: number) => i * (H + stackGap) + H / 2;
  const foot = Math.max(1, order.length) * (H + stackGap) - stackGap;
  const stems = new Map<string, Stem>();
  const anchors = new Map<string, Pt>();
  const hasKids = new Set(u.groups.map((g) => g.familyId));
  const down = (familyId: string, x: number, from: Pt[]) => {
    stems.set(familyId, { familyId, x, head: [...from, { x, y: foot }] });
    if (hasKids.has(familyId)) block.path([from[from.length - 1], { x, y: foot }]);
  };
  if (u.placeholder) {
    block.holders.push({ familyId: u.placeholder, x: 0, y: 0, w: W, h: H });
    block.box(0, 0, W, H, pad);
    const stub = [
      { x: W, y: H / 2 },
      { x: W + tick, y: H / 2 },
    ];
    block.path(stub);
    anchors.set(u.placeholder, stub[1]);
    down(u.placeholder, W + tick, stub);
  }
  order.forEach((m, i) => {
    const y = i * (H + stackGap);
    block.cards.push({
      key: m.ghost ? `${m.personId}~u${u.id}` : m.personId,
      personId: m.personId,
      x: 0,
      y,
      w: W,
      h: H,
      ghost: m.ghost || undefined,
    });
    block.box(0, y, W, y + H, pad + haloOf(ctx, m.personId));
  });
  // Each family has a lane of its own down the side. The family whose upper card is lowest takes the lane
  // nearest the cards, so that no family's line down the side crosses the stubs of another.
  const joined = u.families
    .filter((f) => f.id !== u.placeholder)
    .map((f) => ({
      f,
      idx: f.partners
        .map((p) => at.get(p))
        .filter((i): i is number => i !== undefined)
        .sort((a, b) => a - b),
    }))
    .filter((j) => j.idx.length)
    .sort((a, b) => b.idx[0] - a.idx[0]);
  let lane = 0;
  for (const { f, idx } of joined) {
    const x = W + tick + lane++ * LANE;
    if (idx.length === 1) {
      const stub = [
        { x: W, y: mid(idx[0]) },
        { x, y: mid(idx[0]) },
      ];
      block.path(stub);
      anchors.set(f.id, stub[1]);
      down(f.id, x, stub);
      continue;
    }
    const [a, b] = idx;
    const line = [
      { x: W, y: mid(a) },
      { x, y: mid(a) },
      { x, y: mid(b) },
      { x: W, y: mid(b) },
    ];
    const marker = { x, y: (mid(a) + mid(b)) / 2 };
    block.unions.push({ familyId: f.id, kind: f.kind, ended: isBrokenUp(relationshipStatus(f)), x: marker.x, y: marker.y, line });
    block.path(line);
    anchors.set(f.id, marker);
    down(f.id, x, [marker]);
  }
  return {
    block,
    stems,
    anchors,
    foot,
    width: W,
    top: order.length
      ? mid(
          Math.max(
            0,
            order.findIndex((m) => m === u.core[0]),
          ),
        )
      : H / 2,
  };
}

/** A childless couple as it hangs in a column of brothers and sisters: the partner's card under the child's. */
function stackedCouple(ctx: Ctx, u: Unit, facing: 'west' | 'east'): UnitBlock {
  const st = stackCore(ctx, u);
  const W = st.width;
  for (const m of st.block.unions) st.block.box(m.x - 8, m.y - 8, m.x + 8, m.y + 8, 2);
  if (facing === 'west') return { block: st.block, access: { x: 0, y: st.top }, leaf: false, tight: true };
  // Hung on the left of its line: the same, seen in a mirror.
  const block = new Block();
  block.merge(st.block.mirrored(), W, 0);
  return { block, access: { x: W, y: st.top }, leaf: false, tight: true };
}

/** One structure laid out: the direct line with everything hung on it, then the wings out at its sides. */
function layoutStructure(ctx: Ctx, s: Structure): Block {
  const { familyGap, siblingGap } = ctx.o;
  const scene = unitBlock(ctx, s.centre, 'top', ctx.shape.down, false, { L: true, R: true }).block;
  // Nearest the middle first, so each hangs outside the ones below it.
  const wings = [...scene.wings].sort((a, b) => b.rank - a.rank);
  scene.wings = [];
  const cont = Contour.of(scene.boxes);
  const centreX = (scene.cards[0]?.x ?? 0) + ctx.o.cardWidth / 2;
  const place = (w: Wing, side: Side, kids: Kid[]) => {
    const at = w.head[w.head.length - 1];
    const res = groupBlock(ctx, { familyId: w.group.familyId, kids }, side === 'L' ? ctx.shape.wingL : ctx.shape.wingR, {
      attach: side === 'L' ? 'last' : 'first',
      outer: side,
      stem: 0,
    });
    const c = Contour.of(res.block.boxes, 0, at.y);
    const need = side === 'L' ? cont.pushLeft(c) : cont.pushRight(c);
    const gap = familyGap - siblingGap;
    let x = side === 'L' ? -(need + gap) : need + gap;
    if (!Number.isFinite(x)) x = at.x;
    // Never back across the line it hangs from.
    x = side === 'L' ? Math.min(x, at.x - ctx.o.tick) : Math.max(x, at.x + ctx.o.tick);
    scene.merge(res.block, x, at.y);
    scene.path([at, { x, y: at.y }]);
    cont.add(res.block.boxes, x, at.y);
    cont.span(Math.min(at.x, x) - LINE_PAD, Math.max(at.x, x) + LINE_PAD, at.y - LINE_PAD, at.y + LINE_PAD);
    for (const l of res.lines) scene.lines.push({ ...l, points: tidy([...w.head, ...move(l.points, x, at.y)]) });
  };
  for (const w of wings) {
    const kids = w.group.kids;
    if (w.sides.L && w.sides.R) {
      // Nobody on either side: brothers and sisters are shared out left and right, or one goes to the emptier side.
      if (kids.length === 1) place(w, centreX - scene.x0 <= scene.x1 - centreX ? 'L' : 'R', kids);
      else {
        const half = Math.ceil(kids.length / 2);
        place(w, 'L', kids.slice(0, half));
        place(w, 'R', kids.slice(half));
      }
    } else place(w, w.sides.L ? 'L' : 'R', kids);
  }
  return scene;
}

/** How many made pieces of the tree a Layouter keeps before it starts over. */
const MEMO_LIMIT = 6000;
/**
 * How many layouts a Layouter keeps: as many as have this many cards between them, and no fewer than
 * KEPT_LEAST. A layout of 250 people takes some 100 kB, and fitting such a tree to a page with a box in it
 * goes through some 550 shapes over and over: with room for fewer, none would still be there the next time.
 */
const KEPT_CARDS = 200000;
const KEPT_LEAST = 60;

/** A shape as text: two shapes with the same text lay the tree out the same way. */
export function shapeKey(shape: Shape): string {
  const plans = shape.plans?.size
    ? [...shape.plans]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([id, plan]) => `${id}:${plan}`)
        .join(',')
    : '';
  return `${shape.down}|${shape.bands.join(',')}|${shape.wingL}|${shape.wingR}|${shape.flankL}|${shape.flankR}|${shape.stack}|${plans}`;
}

/** A family whose children can be arranged in more than one way, for Shape.plans. */
export interface FamilyChoice {
  familyId: string;
  /** How many people stand below it: the bigger, the more the choice changes the page. */
  weight: number;
}

/** Lays out trees around the same people in different shapes; what does not depend on the shape is worked out once. */
export class Layouter {
  private readonly structures: Structure[];
  private readonly ranks: Map<string, number>;
  private readonly memo = new Map<string, UnitBlock>();
  /** The families at and below each unit, by the unit's id. */
  private readonly below = new Map<number, Set<string>>();
  /** How many generations of ancestors stand out at the sides. */
  readonly depth: number;
  /** The families with a choice of arrangement, the biggest first. */
  readonly choices: FamilyChoice[];
  /** Who stands where in the tree's make-up, as text: two Layouters with the same text (and the same options) lay out the same trees. */
  readonly signature: string;

  constructor(
    private readonly index: TreeIndex,
    private readonly options: LayoutOptions,
    centreId?: string,
    partnerId?: string,
  ) {
    this.structures = buildStructures(index, centreId, partnerId);
    this.ranks = ranksOf(this.structures);
    this.depth = this.structures.reduce((d, s) => Math.max(d, ...s.units.filter((u) => u.trunk).map((u) => -u.rank)), 0);
    const sizes = new Map<number, number>();
    const size = (u: Unit): number => {
      let n = sizes.get(u.id);
      if (n === undefined) {
        n = u.core.length + u.extras.reduce((sum, e) => sum + e.length, 0);
        for (const g of u.groups) for (const k of g.kids) n += k.unit ? size(k.unit) : 1;
        sizes.set(u.id, n);
      }
      return n;
    };
    const choices: FamilyChoice[] = [];
    for (const s of this.structures)
      for (const u of s.units)
        for (const g of u.groups)
          if (g.kids.length > 1) choices.push({ familyId: g.familyId, weight: g.kids.reduce((sum, k) => sum + (k.unit ? size(k.unit) : 1), 0) });
    this.choices = choices.sort((a, b) => b.weight - a.weight);
    const cards = this.structures.reduce((sum, s) => sum + s.units.reduce((n, u) => n + size(u), 0), 0);
    this.kept = Math.max(KEPT_LEAST, Math.floor(KEPT_CARDS / Math.max(1, cards)));
    const people = (members: readonly Member[]) => members.map((m) => (m.ghost ? `~${m.personId}` : m.personId)).join(',');
    this.signature = this.structures
      .map((s) =>
        s.units
          .map(
            (u) =>
              `${u.id}${u.trunk ? 't' : ''}${u.placeholder ?? ''}[${people(u.core)}|${u.extras.map(people).join('/')}]` +
              u.families.map((f) => `${f.id}${f.kind}${isBrokenUp(relationshipStatus(f)) ? 'x' : ''}`).join('&') +
              u.groups.map((g) => `${g.familyId}>${g.kids.map((k) => `${k.personId}${k.relation}${k.unit?.id ?? ''}`).join(',')}`).join(';') +
              u.ups.map((up) => `^${up.personId}${up.familyId}${up.relation}${up.parents.id}`).join(''),
          )
          .join(' '),
      )
      .join('\n');
  }

  /**
   * Layouts already worked out, by shape: the same shapes are tried for a page upright and on its side, and
   * for the same page with its title or its families' names moved. The latest only (see KEPT_CARDS).
   */
  private readonly done = new Map<string, LayoutResult>();
  private readonly kept: number;
  private readonly short = new WeakSet<LayoutResult>();

  /**
   * The tree in a shape. With `keep` false the layout is not kept for the next time the shape is asked for: for
   * a long search that looks at thousands of shapes once each.
   */
  run(shape: Shape, keep = true): LayoutResult {
    const key = shapeKey(shape);
    let result = this.done.get(key);
    if (result) {
      // Asked for again: it stays longest.
      if (keep) {
        this.done.delete(key);
        this.done.set(key, result);
      }
      return result;
    }
    result = this.layout(shape);
    if (keep) {
      this.done.set(key, result);
      if (this.done.size > this.kept) this.done.delete(this.done.keys().next().value!);
    }
    return result;
  }

  /** Whether a layout was asked (in Shape.plans) for an arrangement a family does not have: the same as a lower one. */
  beyond(result: LayoutResult): boolean {
    return this.short.has(result);
  }

  private familiesBelow(u: Unit): Set<string> {
    let set = this.below.get(u.id);
    if (!set) {
      set = new Set<string>();
      this.below.set(u.id, set);
      for (const g of u.groups) {
        set.add(g.familyId);
        for (const k of g.kids) if (k.unit) for (const id of this.familiesBelow(k.unit)) set.add(id);
      }
      for (const up of u.ups) for (const id of this.familiesBelow(up.parents)) set.add(id);
    }
    return set;
  }

  private layout(shape: Shape): LayoutResult {
    const o = this.options;
    const texts = new Map<number, string>();
    const chosen = (u: Unit): string => {
      if (!shape.plans?.size) return '';
      let text = texts.get(u.id);
      if (text === undefined) {
        const below = this.familiesBelow(u);
        text = '';
        for (const [id, plan] of shape.plans) if (below.has(id)) text += `|${id}:${plan}`;
        texts.set(u.id, text);
      }
      return text;
    };
    const missed = { plan: false };
    // The pieces made for one arrangement of the families serve the next that differs in one family; kept without end they would fill the memory.
    if (this.memo.size > MEMO_LIMIT) this.memo.clear();
    const ctx: Ctx = { o, index: this.index, shape, memo: this.memo, chosen, missed };
    const all = new Block();
    let centre: Pt = { x: 0, y: 0 };
    let nextX = 0;
    let nextY = 0;
    this.structures.forEach((s, i) => {
      const b = layoutStructure(ctx, s);
      if (i === 0) {
        all.merge(b, 0, 0);
        const ids = new Set(s.centre.core.map((m) => m.personId));
        const mid = b.cards.filter((c) => ids.has(c.personId) && !c.ghost);
        if (mid.length) centre = { x: mid.reduce((sum, c) => sum + c.x + c.w / 2, 0) / mid.length, y: mid[0].y + mid[0].h / 2 };
        nextX = b.x0;
        nextY = b.y1 + o.componentGap;
        return;
      }
      // Separate trees stand in a row under the first.
      all.merge(b, nextX - b.x0, nextY - b.y0);
      nextX += b.x1 - b.x0 + o.componentGap;
    });
    const empty = !Number.isFinite(all.x0);
    const result: LayoutResult = {
      cards: all.cards,
      placeholders: all.holders,
      unions: all.unions,
      lines: all.lines,
      bounds: empty ? { x: 0, y: 0, w: 0, h: 0 } : { x: all.x0, y: all.y0, w: all.x1 - all.x0, h: all.y1 - all.y0 },
      ranks: this.ranks,
      generations: new Set(this.ranks.values()).size,
      centre,
    };
    if (missed.plan) this.short.add(result);
    return result;
  }
}

/** Everyone side by side: the tree as wide as it comes. */
export const WIDE: Shape = { down: Infinity, bands: [Infinity], wingL: Infinity, wingR: Infinity, flankL: 'wing', flankR: 'wing', stack: false };
