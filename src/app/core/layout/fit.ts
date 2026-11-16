/**
 * Picks the shape of the tree that suits the room it has: the one whose cards come out biggest there and
 * that leaves the least of the room empty, with the couple in the middle as near the middle of the room as
 * that allows.
 */
import { Layouter, shapeKey } from './engine';
import { Box, keepClear } from './keep-clear';
import { Steps, finish } from './steps';
import { LayoutOptions, LayoutResult, PlanChoice, Shape } from './types';

export interface Room {
  w: number;
  h: number;
  /** Whether a page with the couple it is drawn around near the middle is preferred, among pages about as good: 0 or 1. */
  centred: number;
  /** Boxes in the room the tree keeps clear of (the title, the families' names), in the room's coordinates. */
  blocks?: readonly Box[];
  /** The tree is made no bigger than this, however much room there is. */
  maxScale?: number;
}

export interface Fitted {
  layout: LayoutResult;
  shape: Shape;
  /** Chart units to the room's units. */
  scale: number;
  /** Where the chart's origin goes in the room. */
  x: number;
  y: number;
  /** How far the couple in the middle is from the middle of the room, as shares of its width and height. */
  off: { x: number; y: number };
  /** How much of the room has a card in or near it, 0 to 1. */
  cover: number;
}

/** How a layout sits in a room: as big as fits, the couple in the middle slid as near the room's middle as the spare room lets them. */
export function place(layout: LayoutResult, room: Room): Omit<Fitted, 'shape'> {
  const b = layout.bounds;
  const scale = Math.min(room.w / Math.max(b.w, 1), room.h / Math.max(b.h, 1), room.maxScale ?? Infinity);
  const along = (size: number, from: number, extent: number, centre: number) => {
    const spare = size - extent * scale;
    // Where the origin goes with the content in the middle, then moved by as much of the spare room as brings the centre to the middle.
    const middle = spare / 2 - from * scale;
    const wanted = size / 2 - centre * scale;
    const at = room.centred > 0 ? Math.min(Math.max(wanted, -from * scale), spare - from * scale) : middle;
    return { at, off: Math.abs(at + centre * scale - size / 2) / size };
  };
  const x = along(room.w, b.x, b.w, layout.centre.x);
  const y = along(room.h, b.y, b.h, layout.centre.y);
  // The title and the families' names: the tree stands clear of their boxes, smaller if it has to be.
  const kept = room.blocks?.length ? keepClear(layout, room, room.blocks, scale, { x: x.at, y: y.at }) : undefined;
  if (kept) return { layout, scale: kept.scale, x: kept.x, y: kept.y, off: { x: x.off, y: y.off }, cover: coverOf(layout, room, kept.scale, kept.x, kept.y) };
  return { layout, scale, x: x.at, y: y.at, off: { x: x.off, y: y.off }, cover: coverOf(layout, room, scale, x.at, y.at) };
}

/** Across the room, for coverOf. */
const COVER_CELLS = 24;

/**
 * How much of the room is in use: the share of the squares of a coarse grid over it that a card reaches into
 * or stands next to. Two pages with cards of one size differ in this when one bunches its families up in
 * columns and the other spreads them over the paper.
 */
function coverOf(layout: LayoutResult, room: Room, scale: number, ox: number, oy: number): number {
  const cell = room.w / COVER_CELLS;
  const down = Math.max(1, Math.round(room.h / cell));
  const taken = new Uint8Array(COVER_CELLS * down);
  const reach = cell * 0.35;
  let count = 0;
  for (const c of layout.cards) {
    const x0 = Math.max(0, Math.floor((ox + c.x * scale - reach) / cell));
    const x1 = Math.min(COVER_CELLS - 1, Math.floor((ox + (c.x + c.w) * scale + reach) / cell));
    const y0 = Math.max(0, Math.floor((oy + c.y * scale - reach) / cell));
    const y1 = Math.min(down - 1, Math.floor((oy + (c.y + c.h) * scale + reach) / cell));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        if (!taken[y * COVER_CELLS + x]) {
          taken[y * COVER_CELLS + x] = 1;
          count++;
        }
  }
  return count / taken.length;
}

/** How much a fully used room counts for, next to the size of the cards. */
const COVER_WEIGHT = 0.25;

function score(f: Omit<Fitted, 'shape'>, room: Room): number {
  // Bigger cards come first, then paper left empty; being in the middle only decides between pages about as good.
  return f.scale * (1 + COVER_WEIGHT * f.cover) * (1 - room.centred * (f.off.x + f.off.y) * 0.12);
}

/** What is settled before the fitting starts. */
export interface FitGiven {
  /** Families arranged by hand (see Shape.plans): kept as they are, whatever would fit better. */
  plans?: ReadonlyMap<string, PlanChoice>;
  /** False: couples are never stood one over the other. */
  stack?: boolean;
  /** How hard to look, next to the usual: 2 tries twice as many arrangements of single families. */
  work?: number;
  /**
   * A much longer search after the usual one, for the arrangement that leaves the least of the room empty (see
   * `spread` below). Several times the work; never a worse page than without.
   */
  fill?: boolean;
}

/** How much work goes into arranging single families: layouts tried, times the people on them. */
const FAMILY_WORK = 60000;
/** The same for the longer search (FitGiven.fill), and the most layouts it tries in one room whatever the size of the tree. */
const FILL_WORK = 360000;
const FILL_MOST = 3000;
/** How many times running the longer search may arrange families at random and find nothing better, before it stops. */
const FILL_IDLE = 7;

const WIDTHS = [1, 2, 3, 4, 6, 8, 12, Infinity];

interface Found {
  shape: Shape;
  value: number;
  fit: Omit<Fitted, 'shape'>;
}

/** A shape that was tried in a room, and what it came to there. */
interface Tried {
  shape: Shape;
  value: number;
  /** The size of the tree's outline, roughly: two shapes with the same are much the same tree. */
  outline: string;
  /** Asked for an arrangement a family does not have (Layouter.beyond). */
  beyond: boolean;
}

/** The searches for the best shape in one room; what is tried there is tried once. */
function searchIn(layouter: Layouter, options: LayoutOptions, room: Room, effort: 'full' | 'quick', given: FitGiven) {
  const fixed = given.plans?.size ? given.plans : undefined;
  const mayStack = given.stack !== false && options.stackCouples;
  const unit = options.cardWidth + options.partnerGap;
  const w = (n: number) => (Number.isFinite(n) ? n * unit : Infinity);
  const depth = Math.max(1, Math.min(layouter.depth, 8));
  // What each shape tried came to. Not the layouts themselves: a big tree is tried in a thousand shapes, and
  // kept they would fill the memory; the few that are wanted in full are laid out again (see `found`).
  const seen = new Map<string, Tried>();
  // Set when a layout has been made (the slow part): the searches below stop for a moment after each (see Steps).
  let worked = false;
  const made = () => {
    const was = worked;
    worked = false;
    return was;
  };
  const tryShape = (shape: Shape) => {
    const key = shapeKey(shape);
    let got = seen.get(key);
    if (!got) {
      worked = true;
      const layout = layouter.run(shape);
      const fit = place(layout, room);
      const b = layout.bounds;
      got = { shape, value: score(fit, room), outline: `${Math.round(b.w / 40)}x${Math.round(b.h / 40)}`, beyond: layouter.beyond(layout) };
      seen.set(key, got);
    }
    return got;
  };
  const found = (shape: Shape): Found => {
    const fit = place(layouter.run(shape), room);
    return { shape, fit, value: score(fit, room) };
  };
  /** The best shapes tried here, each a tree of another outline: the best first. */
  const tops = (most: number): Shape[] => {
    const outlines = new Set<string>();
    const out: Shape[] = [];
    for (const got of [...seen.values()].sort((a, b) => b.value - a.value)) {
      if (out.length >= most) break;
      if (outlines.has(got.outline) || got.beyond) continue;
      outlines.add(got.outline);
      out.push(got.shape);
    }
    return out;
  };
  const even = (down: number, band: number, wing: number, flank: 'wing' | 'band'): Shape => ({
    down: w(down),
    bands: new Array<number>(depth).fill(w(band)),
    wingL: w(wing),
    wingR: w(wing),
    flankL: flank,
    flankR: flank,
    stack: false,
    plans: fixed,
  });
  /** The shapes the search starts from. */
  const seeds = (): Shape[] =>
    (effort === 'quick'
      ? [
          even(4, 2, 3, 'wing'),
          even(Infinity, 4, Infinity, 'wing'),
          even(2, 2, 1, 'wing'),
          even(3, 2, 2, 'band'),
          { ...even(4, 2, 3, 'wing'), stack: true },
          { ...even(2, 2, 1, 'wing'), stack: true },
        ]
      : [even(4, 2, 3, 'wing'), even(Infinity, Infinity, Infinity, 'wing'), even(2, 2, 1, 'band')]
    ).filter((seed) => !seed.stack || mayStack);
  /** The shapes one step from a shape, one kind of width at a time: each kind is tried from the shape as the kinds before it left it. */
  const kinds: ((shape: Shape) => Shape[])[] = [
    (shape) => (mayStack ? [{ ...shape, stack: !shape.stack }] : []),
    (shape) => WIDTHS.map((n) => ({ ...shape, down: w(n) })),
    ...Array.from({ length: depth }, (_, d) => (shape: Shape) => WIDTHS.map((n) => ({ ...shape, bands: shape.bands.map((c, i) => (i === d ? w(n) : c)) }))),
    ...(['wing', 'band'] as const).map((flankL) => (shape: Shape) => WIDTHS.map((n) => ({ ...shape, wingL: w(n), flankL }))),
    ...(['wing', 'band'] as const).map((flankR) => (shape: Shape) => WIDTHS.map((n) => ({ ...shape, wingR: w(n), flankR }))),
  ];
  const families = layouter.choices.filter((c) => !fixed?.has(c.familyId)).map((c) => c.familyId);

  /**
   * The best shape reached from the starts. The widths families may spread to are tried one kind at a time (the
   * children of the couple in the middle, the brothers and sisters along the direct line generation by
   * generation, and those at either side of the tree), keeping whatever makes the page better, until nothing
   * does. Then the families are gone through one by one, the biggest first: each is tried wider and narrower
   * than the widths gave it, which lets one spread out into room the others leave.
   */
  function* search(starts: readonly Shape[]): Steps<Found> {
    let best: Found | undefined;
    for (const start of starts) {
      let shape = start;
      let value = tryShape(shape).value;
      if (made()) yield;
      for (let round = 0; round < (effort === 'quick' ? 0 : 3); round++) {
        const before = value;
        for (const kind of kinds)
          for (const c of kind(shape)) {
            const v = tryShape(c).value;
            if (made()) yield;
            if (v > value * 1.0005) {
              value = v;
              shape = c;
            }
          }
        if (value <= before * 1.0005) break;
      }
      if (!best || value > best.value) best = found(shape);
    }
    if (!best) throw new Error('no shape to start from');
    if (effort !== 'full') return best;
    let left = Math.floor(((given.work ?? 1) * FAMILY_WORK) / Math.max(1, best.fit.layout.cards.length));
    let { shape, value } = best;
    // The biggest families first.
    for (let sweep = 0; sweep < 2 && left > 0; sweep++) {
      const before = value;
      for (const familyId of families) {
        const now = shape.plans?.get(familyId);
        for (let plan = 0; plan < 8 && left > 0; plan++) {
          if (plan === now) continue;
          const next: Shape = { ...shape, plans: new Map(shape.plans ?? []).set(familyId, plan) };
          const got = tryShape(next);
          if (made()) yield;
          left--;
          // The family has no such arrangement, nor any after it.
          if (got.beyond) break;
          if (got.value > value * 1.0005) {
            value = got.value;
            shape = next;
          }
        }
      }
      if (value <= before * 1.0005) break;
    }
    return value > best.value ? found(shape) : best;
  }

  /**
   * The longer search: families spread into room that would stay empty. The search above keeps a change only
   * when the cards get bigger at once, and so stops where two changes are needed together: one family made
   * lower where the page is too tall, another made narrower to make up for the width that took. Here a change
   * also counts for making the tree smaller in the direction that does not matter yet (the tree is judged
   * partly by the room its outline takes, whatever its proportions), which opens the way for the next; and
   * from the best page found a few families at a time are arranged at random and the search run again from
   * there. Whatever is best by the room's own measure along the way is kept: never worse than the start.
   *
   * @param share How much of the work of a whole search to spend.
   */
  function* spread(start: Found, share: number): Steps<Found> {
    if (effort !== 'full' || !families.length) return start;
    const most = Math.min(FILL_MOST, Math.floor((share * FILL_WORK) / Math.max(1, start.fit.layout.cards.length)));
    let tried = 0;
    let top = { shape: start.shape, value: start.value };
    // Thousands of layouts looked at once each: only what they come to is kept.
    const looked = new Map<string, { value: number; size: number; beyond: boolean }>();
    // Better by the room's measure, and never with smaller cards than at the start.
    const least = start.fit.scale * 0.9999;
    const look = (shape: Shape) => {
      const key = shapeKey(shape);
      let got = looked.get(key);
      if (!got) {
        tried++;
        worked = true;
        const layout = layouter.run(shape, false);
        const fit = place(layout, room);
        const b = layout.bounds;
        // How big the cards would come out if the tree had the room's proportions: what its outline takes of the room.
        const size = Math.sqrt((room.w * room.h) / Math.max(1, b.w * b.h)) * (1 + COVER_WEIGHT * fit.cover);
        got = { value: score(fit, room), size, beyond: layouter.beyond(layout) };
        looked.set(key, got);
        if (!got.beyond && fit.scale >= least && got.value > top.value * 1.0001) top = { shape, value: got.value };
      }
      return got;
    };
    /** From a shape, every change that makes it better by the measure, until none does; `blend` is how much the outline counts. */
    function* descend(from: Shape, blend: number, sweeps: number): Steps<Shape> {
      const of = (g: { value: number; size: number }) => Math.pow(g.value, 1 - blend) * Math.pow(g.size, blend);
      let shape = from;
      let now = of(look(shape));
      if (made()) yield;
      for (let sweep = 0; sweep < sweeps && tried < most; sweep++) {
        const before = now;
        for (const familyId of families) {
          if (tried >= most) break;
          const has = shape.plans?.get(familyId);
          for (let plan = 0; plan < 8; plan++) {
            if (plan === has) continue;
            const next: Shape = { ...shape, plans: new Map(shape.plans ?? []).set(familyId, plan) };
            const got = look(next);
            if (made()) yield;
            if (got.beyond) break;
            if (of(got) > now * 1.0005) {
              now = of(got);
              shape = next;
            }
          }
        }
        for (const kind of kinds)
          for (const next of kind(shape)) {
            if (tried >= most) break;
            const got = look(next);
            if (made()) yield;
            if (of(got) > now * 1.0005) {
              now = of(got);
              shape = next;
            }
          }
        if (now <= before * 1.0005) break;
      }
      return shape;
    }
    // Half by the outline first, and from where that leads by the room's measure alone.
    yield* descend(yield* descend(top.shape, 0.5, 4), 0, 4);
    yield* descend(top.shape, 0, 4);
    // The same numbers every time: the same page for the same tree.
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    // Until the work is done, or nothing has come of it several times running.
    for (let idle = 0; tried < most && idle < FILL_IDLE; idle++) {
      const before = top.value;
      const plans = new Map(top.shape.plans ?? []);
      const some = 2 + Math.floor(random() * 3);
      for (let i = 0; i < some; i++) plans.set(families[Math.floor(random() * families.length)], Math.floor(random() * 5));
      const shaken: Shape = { ...top.shape, plans };
      // Counted even when it leads nowhere, so that the search ends.
      tried++;
      if (!look(shaken).beyond) yield* descend(shaken, 0, 3);
      if (top.value > before) idle = -1;
    }
    return top.value > start.value ? found(top.shape) : start;
  }

  return { seeds, search, spread, tops };
}

/**
 * The best shape for the room. Where the room has boxes to keep clear of (the title, the families' names), the
 * shape is found for the room as if it were empty and from there made to suit the boxes: with them in the way
 * from the start, the search stops at a worse page.
 */
export function fitLayout(layouter: Layouter, options: LayoutOptions, room: Room, effort: 'full' | 'quick' = 'full', given: FitGiven = {}): Fitted {
  return finish(fitLayoutSteps(layouter, options, room, effort, given));
}

/** fitLayout a piece at a time (see Steps): for a big tree, whose fitting takes seconds. */
export function* fitLayoutSteps(
  layouter: Layouter,
  options: LayoutOptions,
  room: Room,
  effort: 'full' | 'quick' = 'full',
  given: FitGiven = {},
): Steps<Fitted> {
  if (!given.fill || effort !== 'full') return yield* fitted(layouter, options, room, effort, given);
  // The longer search takes seconds: its answer for the same tree in the same room is kept (the page is drawn
  // again for every change of a setting, most of which change nothing here).
  const key = [
    layouter.signature,
    JSON.stringify(options),
    JSON.stringify([room.w, room.h, room.centred, room.maxScale ?? null, room.blocks ?? []]),
    JSON.stringify([given.stack ?? null, given.work ?? 1, [...(given.plans ?? [])]]),
  ].join('\n');
  const kept = filled.get(key);
  if (kept) {
    filled.delete(key);
    filled.set(key, kept);
    return { ...place(layouter.run(kept), room), shape: kept };
  }
  const found = yield* fitted(layouter, options, room, effort, given);
  filled.set(key, found.shape);
  if (filled.size > FILLED_KEPT) filled.delete(filled.keys().next().value!);
  return found;
}

/** The shapes the longer search found, by what it was asked: the latest few. */
const filled = new Map<string, Shape>();
const FILLED_KEPT = 12;

/**
 * What a Layouter was already fitted to: the same tree is fitted to a page with its boxes here and there, and to
 * the page upright and on its side. The latest few: a Layouter serves a page for as long as its tree stays the
 * same, and every title typed and every box moved is another room.
 */
const fittedBefore = new WeakMap<Layouter, Map<string, Fitted>>();
const FITTED_KEPT = 24;
/** The search in a room as if it were empty, by Layouter: the start for the same room with any boxes in it. */
const opened = new WeakMap<Layouter, Map<string, { search: ReturnType<typeof searchIn>; first: Found }>>();

function* fitted(layouter: Layouter, options: LayoutOptions, room: Room, effort: 'full' | 'quick', given: FitGiven): Steps<Fitted> {
  const asked = JSON.stringify([
    room.w,
    room.h,
    room.centred,
    room.maxScale ?? null,
    effort,
    given.stack ?? null,
    given.work ?? 1,
    [...(given.plans ?? [])],
    options,
  ]);
  const key = `${asked}|${JSON.stringify(room.blocks ?? [])}|${!!given.fill}`;
  const before = fittedBefore.get(layouter) ?? new Map<string, Fitted>();
  fittedBefore.set(layouter, before);
  const kept = before.get(key);
  if (kept) {
    before.delete(key);
    before.set(key, kept);
    return kept;
  }
  const boxes = effort === 'full' && !!room.blocks?.length;
  const starts = opened.get(layouter) ?? new Map<string, { search: ReturnType<typeof searchIn>; first: Found }>();
  opened.set(layouter, starts);
  let start = starts.get(asked);
  if (!start) {
    const search = searchIn(layouter, options, boxes ? { ...room, blocks: undefined } : room, effort, given);
    start = { search, first: yield* search.search(search.seeds()) };
    starts.set(asked, start);
  }
  const open = start.search;
  const first = start.first;
  const done = (best: Found): Fitted => {
    const found = { ...best.fit, shape: best.shape };
    before.set(key, found);
    if (before.size > FITTED_KEPT) before.delete(before.keys().next().value!);
    return found;
  };
  if (!boxes) return done(given.fill ? yield* open.spread(first, 1) : first);
  const within = searchIn(layouter, options, room, effort, given);
  let best = yield* within.search([first.shape]);
  if (given.fill) {
    // The longer search in the empty room first (it is the smoother ground), then with the boxes.
    const wider = yield* open.spread(first, 0.5);
    if (wider !== first) {
      const again = yield* within.search([wider.shape]);
      if (again.value > best.value && again.fit.scale >= best.fit.scale * 0.9999) best = again;
    }
    best = yield* within.spread(best, 1);
  }
  return done(best);
}

/**
 * The best few shapes found for the room as if it had no boxes in it, each a tree of another outline, the best
 * first: for judging where a box could go (the tree is not the same tree around every place).
 */
export function fitShapes(layouter: Layouter, options: LayoutOptions, room: Room, given: FitGiven = {}, most = 16): Shape[] {
  return finish(fitShapesSteps(layouter, options, room, given, most));
}

/** fitShapes a piece at a time (see Steps). */
export function* fitShapesSteps(layouter: Layouter, options: LayoutOptions, room: Room, given: FitGiven = {}, most = 16): Steps<Shape[]> {
  const open: Room = { ...room, blocks: undefined };
  const plain: FitGiven = { ...given, fill: false };
  const first = yield* fitted(layouter, options, open, 'full', plain);
  const asked = JSON.stringify([
    open.w,
    open.h,
    open.centred,
    open.maxScale ?? null,
    'full',
    plain.stack ?? null,
    plain.work ?? 1,
    [...(plain.plans ?? [])],
    options,
  ]);
  return opened.get(layouter)?.get(asked)?.search.tops(most) ?? [first.shape];
}
