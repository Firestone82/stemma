import { ChildRelation, FamilyKind } from '../model/types';

export interface Pt {
  x: number;
  y: number;
}

export interface LayoutOptions {
  cardWidth: number;
  cardHeight: number;
  /** Space between two partners; the union marker sits in it. */
  partnerGap: number;
  /** Space between siblings. */
  siblingGap: number;
  /**
   * Space between neighbouring families in a row that are first cousins'; more
   * distant families get more (see gapBetweenFamilies in layout.ts).
   */
  familyGap: number;
  /** Space between separate trees. */
  componentGap: number;
  /** Vertical space between generations, before extra line tracks. */
  rowGap: number;
  /** Distance between stacked horizontal lines in one gap. */
  trackGap: number;
  /** Radius of the marker for parents nobody has entered yet. */
  /** No longer drawn: the marker for parents nobody has entered yet is a card-sized box. */
  placeholderRadius: number;
  /** Radius of the union marker between partners. */
  junctionRadius: number;
  /**
   * Generations (0 = the oldest, as LayoutResult.rows are numbered) drawn in
   * two tiers: every other couple or person a card's height lower, so
   * neighbours may overlap by up to half a card and the row takes about half
   * the width. Prints use this to make the cards bigger when a wide tree is
   * printed on narrow paper. An extra row between generations is not tiered.
   */
  tierGenerations?: readonly number[];
  /**
   * Couples without children take the room of one card: the partner who
   * married in is drawn as a smaller card tucked over the top right corner of
   * the other's (LayoutCard.tuckedOn). Prints use this to save width.
   */
  compactChildless?: boolean;
  /**
   * With compactChildless: the partner's card goes under the other's at full
   * size instead of over its corner, so the couple takes no more width than
   * one card and the row grows downwards instead.
   */
  tuckBelow?: boolean;
}

/** Space between the two tiers of a row drawn in two tiers (see LayoutOptions.tierGenerations). */
export const TIER_GAP = 14;

/** A tucked card's size, as a share of a full card's (see LayoutOptions.compactChildless). */
export const TUCK_SCALE = 0.85;
/** How far a tucked card reaches past the full card's right edge, as a share of its own width. */
export const TUCK_OUT = 0.65;
/** How far a tucked card reaches above the full card's top, as a share of its own height. */
export const TUCK_UP = 0.62;
/** Space between a card and the partner's card stacked under it (see LayoutOptions.tuckBelow). */
export const TUCK_BELOW_GAP = 8;
/** How far the line joining a card and the partner's card stacked under it runs out past their right edge. */
export const TUCK_SIDE = 12;

export const COMFORTABLE_LAYOUT: LayoutOptions = {
  cardWidth: 188,
  cardHeight: 70,
  partnerGap: 44,
  siblingGap: 22,
  familyGap: 64,
  componentGap: 140,
  rowGap: 78,
  trackGap: 16,
  placeholderRadius: 11,
  junctionRadius: 7,
};

export interface LayoutCard {
  personId: string;
  /** Top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  rank: number;
  /** A smaller card drawn over the top right corner of this person's card (see LayoutOptions.compactChildless). */
  tuckedOn?: string;
}

/** Parents who are not entered yet, drawn as a small dashed circle. */
/** Parents nobody has entered yet: a card-sized dashed box with a question mark, which the children hang from. */
export interface LayoutPlaceholder {
  familyId: string;
  /** Its centre. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  rank: number;
}

/**
 * How a family's partners are drawn:
 * - gap: partners side by side, marker between them
 * - bridge: partners in one row with someone between them; the line arches over
 * - single: one known parent; children hang from the card
 * - none: no known parents; children hang from a placeholder
 * - split: partners in different generations
 */
/**
 * `tucked`: the partner's small card lies over the other's, the marker at its corner, drawn over the cards;
 * or, stacked under it, the two are joined by a line down their right side, with the marker on it.
 */
export type UnionMode = 'gap' | 'bridge' | 'single' | 'none' | 'split' | 'tucked';

export interface LayoutUnion {
  familyId: string;
  mode: UnionMode;
  kind: FamilyKind;
  /** Divorce, separation or annulment. */
  ended: boolean;
  /** Centre of the union marker, or the point children hang from. */
  cx: number;
  cy: number;
  /** The line between partners as a polyline. Empty when there is no partner line. */
  line: Pt[];
  rank: number;
}

export interface LayoutDrop {
  childId: string;
  relation: ChildRelation;
  /** Where the drop leaves the horizontal bar. */
  x: number;
  /**
   * Points after the bar; the last one is where the line meets the child's
   * card: the top centre, or, for brothers and sisters stacked in a column
   * (see LayoutCard.tuckedOn), the middle of its right edge, reached from the
   * line down the column's side.
   */
  points: Pt[];
  /**
   * For a line to a child more than one row down: the rows it passes on the
   * way, in order, with where it runs between their cards (x) and where it
   * enters and leaves each row (y). A curved line turns only between them.
   */
  through?: LayoutPass[];
}

/**
 * Where a line passes a row between its cards: straight down at `x`, from
 * `from` to `to`. `clearAbove` says the row has no cards between where the
 * line comes from and `x`, `clearBelow` none between `x` and where it goes
 * on to; a curved line may then sweep through the row on that side instead
 * of running straight down, and through the whole row when both are clear.
 */
export interface LayoutPass {
  x: number;
  from: number;
  to: number;
  clearAbove?: boolean;
  clearBelow?: boolean;
}

/** The lines from a family to its children: a stem, a bar and one drop per child. */
export interface LayoutConnector {
  familyId: string;
  stem: Pt;
  /** Where the parents' row ends below the stem. A line that turns only past it cannot run behind a card in that row. */
  clearY: number;
  barY: number;
  drops: LayoutDrop[];
}

/** A secondary parent link (for example adoptive parents when birth parents are also known). */
export interface LayoutLink {
  familyId: string;
  childId: string;
  relation: ChildRelation;
  from: Pt;
  /** Where the parents' row ends below `from` (see LayoutConnector). */
  clearY: number;
  to: Pt;
}

export interface LayoutRow {
  rank: number;
  y: number;
  h: number;
  /** Generation number in Roman numerals, oldest first. */
  label: string;
  /**
   * What the generation covers on the page: its own row, and any rows of their
   * own beneath it (see LayoutResult.lanes), whose people count with this
   * generation. Bands behind the generations reach from `top` to `bottom`.
   */
  top: number;
  bottom: number;
}

export interface LayoutBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  cards: LayoutCard[];
  placeholders: LayoutPlaceholder[];
  unions: LayoutUnion[];
  connectors: LayoutConnector[];
  links: LayoutLink[];
  rows: LayoutRow[];
  /**
   * Rows between the generations, with no generation number of their own: for
   * the family of someone who married in, when their own generation's row has
   * no room for it near them, or for a couple from two families, whose
   * families' lines can then come down past the rest of their generation.
   */
  lanes: LayoutRow[];
  bounds: LayoutBounds;
  /** Generation index of every person (0 = top row). */
  ranks: ReadonlyMap<string, number>;
  /** Number of line crossings left after optimisation (for tests and tuning). */
  crossings: number;
  /**
   * Where the layout put everyone and the lines between rows, before any moves
   * by hand: given to the next layout as its hint, so the chart keeps its order.
   */
  hint?: ReadonlyMap<string, number>;
}

export function toRoman(n: number): string {
  if (n <= 0 || n >= 4000) return String(n);
  const table: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
