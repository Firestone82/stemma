/**
 * What the layout works with and what it hands back: cards, the markers between partners and the lines
 * from parents to children, in chart units. The chart and the prints draw the same result.
 */
import { ChildRelation, FamilyKind } from '../model/types';

export interface Pt {
  x: number;
  y: number;
}

export interface LayoutOptions {
  cardWidth: number;
  cardHeight: number;
  /**
   * Cards that are not `cardWidth` wide, by person: someone whose names need more room (see
   * PrintSettings.freeWidths). Everyone else's card, and every card's height, is the same.
   */
  widths?: Readonly<Record<string, number>>;
  /**
   * Cards that keep more room round them than the rest, so that something drawn round them (the frame round
   * the couple a print is drawn around) is not crowded by the cards and families beside them.
   */
  halo?: { ids: readonly string[]; pad: number };
  /** Space between two partners; the marker sits in it and the line to their children starts there. */
  partnerGap: number;
  /** Space between brothers and sisters without families of their own. */
  siblingGap: number;
  /** Padding between families, so they do not run into each other. */
  familyGap: number;
  /** From a line down the side of a list of children to their cards. */
  tick: number;
  /** From the parents' cards down to the bar or the first turn of the line to their children. */
  stem: number;
  /** From that bar down to the children's cards. */
  drop: number;
  /** Space between someone's card and their partner's under it, where a couple is stacked. */
  stackGap: number;
  /** Space between separate trees. */
  componentGap: number;
  /**
   * Couples may stand one over the other: in a column of children, someone whose only connection is a partner
   * has the partner's card under their own, and the oldest couple of a line may stand so too (Shape.stack).
   * Without it a couple always stands side by side.
   */
  stackCouples: boolean;
  /**
   * Someone with several partners stands between them, a partner on either side, also where they hang at the
   * side of a line (the line to them is then led over the partner in its way). Without it the partners there
   * all stand on the far side, the line to each further one led over the cards between.
   */
  amidPartners: boolean;
  /**
   * People whose couple stands the other way round, partners swapped from side to side (or, one over the
   * other, top to bottom): a row with one of them in it is turned over; with two of them (both partners
   * asked for it) it stays as it was.
   */
  flipped?: readonly string[];
}

export const LAYOUT: LayoutOptions = {
  cardWidth: 188,
  cardHeight: 66,
  partnerGap: 30,
  siblingGap: 12,
  familyGap: 30,
  tick: 16,
  stem: 16,
  drop: 16,
  stackGap: 10,
  componentGap: 90,
  stackCouples: true,
  amidPartners: true,
};

/**
 * The editor's chart: families further apart than on a print, so each family's background stands on its own
 * with room round it, and more room between generations, so lines of different families running through one
 * gap keep well apart.
 */
export const EDITOR_LAYOUT: Partial<LayoutOptions> = {
  familyGap: 64,
  stem: 22,
  drop: 22,
};

/**
 * The same with families as close together as they go: the least room between cards, families and lines that
 * still keeps every line clear of every card. For a print where the size of the cards matters most.
 */
export const TIGHT_LAYOUT: Partial<LayoutOptions> = {
  partnerGap: 26,
  siblingGap: 7,
  familyGap: 15,
  tick: 11,
  stem: 11,
  drop: 11,
  stackGap: 7,
  componentGap: 50,
};

export interface LayoutCard {
  /** Unique on the chart: the person's id, or another for a card that stands in for someone drawn elsewhere. */
  key: string;
  personId: string;
  /** Top-left corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * The person has a card of their own elsewhere on the chart (they married a relative, or descend from the
   * same couple twice); this one only marks their place in this family.
   */
  ghost?: boolean;
}

/** Parents nobody has entered yet: a card-sized dashed box with a question mark, which the children hang from. */
export interface LayoutPlaceholder {
  familyId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A couple: where their marker goes and the line between their cards. */
export interface LayoutUnion {
  familyId: string;
  kind: FamilyKind;
  /** Divorce, separation or annulment. */
  ended: boolean;
  /** Centre of the marker. */
  x: number;
  y: number;
  /** The line between the partners' cards, through the marker. */
  line: Pt[];
}

/** The line from a family to one of its children, from the parents' marker (or card) to the child's card. */
export interface LayoutLine {
  key: string;
  familyId: string;
  childId: string;
  relation: ChildRelation;
  /** Part of the direct line of the people in the middle: drawn a little heavier. */
  trunk: boolean;
  points: Pt[];
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
  lines: LayoutLine[];
  bounds: LayoutBounds;
  /** Generation of every person, 0 for the oldest. */
  ranks: ReadonlyMap<string, number>;
  /** How many generations the chart has. */
  generations: number;
  /** The middle of the chart: between the couple it is drawn around (or the middle of the one card). */
  centre: Pt;
}

/**
 * How the tree is shaped to suit the room it has. Widths are in chart units and say how wide a family may
 * spread before its children are folded into lists; Infinity leaves everyone side by side.
 */
export interface Shape {
  /** The children and grandchildren of the couple the chart is drawn around. */
  down: number;
  /** Brothers and sisters hung along the direct line, by how many generations above the middle their parents are: parents first. */
  bands: number[];
  /** Brothers and sisters hung out at the left and right side of the tree. */
  wingL: number;
  wingR: number;
  /** Where the brothers and sisters of the outermost of the direct line go: out at the side, or along the line. */
  flankL: 'wing' | 'band';
  flankR: 'wing' | 'band';
  /** The oldest couple of each line, with nobody above them, one over the other instead of side by side. */
  stack: boolean;
  /**
   * For single families, by family id: which of the ways their children can be arranged, whatever the widths
   * above say. 0 is the widest (everyone side by side); higher numbers fold more of them into columns. Or by
   * name: side by side, down both sides of a line, or in one column.
   */
  plans?: ReadonlyMap<string, PlanChoice>;
}

export type PlanChoice = number | 'row' | 'columns' | 'column';

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
