/**
 * Domain model for a family tree.
 *
 * The model mirrors the structure of the XML file format (see schema/stemma-1.xsd):
 * people, and families that join up to two partners with their children. A family
 * can have zero partners (siblings whose parents are unknown) or one partner
 * (a single known parent).
 */

export type Sex = 'female' | 'male' | 'other' | 'unknown';

export type DateQualifier = 'about' | 'before' | 'after' | 'estimated' | 'calculated';

/**
 * A genealogical date. Dates are often partial or approximate, so the value is an
 * ISO-8601 calendar date that may be truncated to a month or a year.
 * When the date cannot be expressed that way, `text` keeps the original wording.
 */
export interface GenDate {
  /** 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD'. Empty when only `text` is known. */
  value: string;
  qualifier?: DateQualifier;
  /** Free-form date wording, e.g. "Easter 1902". Used when `value` is empty. */
  text?: string;
}

export interface LifeEvent {
  date?: GenDate;
  /** Nobody knows when it was (format 1.7): a missing date is not a gap to fill in. */
  dateUnknown?: boolean;
  place?: string;
  ext?: Extensions;
}

export type FamilyEndReason = 'divorce' | 'separation' | 'annulment' | 'death' | 'other';

export interface FamilyEnd extends LifeEvent {
  reason?: FamilyEndReason;
}

export interface PersonName {
  given: string;
  surname: string;
  /** Nobody knows the given name (format 1.7): an empty `given` is then not a gap to fill in. */
  givenUnknown?: boolean;
  /** Surname at birth, when different from the current surname ("née"). */
  birthSurname?: string;
  /**
   * The surname is not recorded but taken from the husband's (see
   * married-surnames.ts): shown and used like any other, left out of the file.
   */
  derived?: boolean;
  /**
   * For a woman married more than once (format 1.9): the marriage, by family id, whose husband's surname she
   * bears, chosen from a list. Without it, a surname taken from a husband is her current husband's.
   */
  surnameFrom?: string;
  /** "Known as". No longer shown or edited; kept from files and saved back. */
  nickname?: string;
  ext?: Extensions;
}

/**
 * XML content the app does not understand, kept so that files written by newer
 * versions survive a round trip through an older version without losing data.
 */
export interface Extensions {
  /** Unknown attributes by qualified name. */
  attrs?: Record<string, string>;
  /** Unknown child elements, serialised as XML. */
  elements?: string[];
}

export interface Person {
  id: string;
  sex: Sex;
  name: PersonName;
  birth?: LifeEvent;
  /** Present when the person has died, even if no date or place is known. */
  death?: LifeEvent;
  /** No longer shown or edited; kept from files and saved back. */
  occupation?: string;
  notes?: string;
  /** Portrait as a data: URL (kept small, see photo resizing in the editor). */
  photo?: string;
  /** Left out of prints (format 1.6): still on the chart, never on paper. */
  hiddenFromPrint?: boolean;
  ext?: Extensions;
}

export type FamilyKind = 'marriage' | 'partnership' | 'unknown';

export type ChildRelation = 'biological' | 'adopted' | 'foster' | 'step' | 'unknown';

export interface FamilyChild {
  personId: string;
  relation: ChildRelation;
  /**
   * Children of one family with the same value were born together: twins,
   * triplets and so on (format 1.3). They share the date and place of birth.
   */
  birthGroup?: string;
  ext?: Extensions;
}

export interface Family {
  id: string;
  kind: FamilyKind;
  /** Zero, one or two person ids. */
  partners: string[];
  /** In birth order. */
  children: FamilyChild[];
  /**
   * When the couple got engaged (format 1.1). A couple who are engaged but not
   * married yet is a partnership with an engagement.
   */
  engagement?: LifeEvent;
  /** The wedding, or the start of the partnership. */
  start?: LifeEvent;
  end?: FamilyEnd;
  // The dates and places of these three events are no longer shown or edited; they are kept from files and saved back.
  notes?: string;
  /**
   * The day the family's data was confirmed as right in the review (YYYY-MM-DD), when it was. Cleared by
   * asking for the review again.
   */
  checked?: string;
  ext?: Extensions;
}

export interface TreeMeta {
  title: string;
  description?: string;
  /** ISO timestamps. */
  created?: string;
  modified?: string;
  /** The person the chart is drawn around; also listed first. */
  homePersonId?: string;
  ext?: Extensions;
}

/** How dates are written on the cards: not at all, years only, or in full where the day or month is known and the card has room. */
export type DateStyle = 'none' | 'years' | 'full';

/**
 * What the cards show. Every part can be switched off; the chart and the prints each have their own set,
 * saved in the file so a tree reopens looking the same.
 */
export interface CardSettings {
  /** The shield with the person's initials, in their family's colour. */
  showEmblems: boolean;
  /** The surname at birth under the surname ("née Barlow"). */
  showBirthNames: boolean;
  /**
   * With the surnames at birth: "née Unknown" for a married woman who bears her husband's name and whose own
   * nobody has entered (nor her father, whose name it would be).
   */
  unknownBirthNames: boolean;
  dates: DateStyle;
  /** Where the shield stands on the card: level with the given names at the top, or in the middle of the card's height. */
  emblemAlign: EmblemAlign;
  /** The sex as an accent: a band down the card's edge and a slight tint, blue for men, rose for women. */
  sexColors: boolean;
  /** A black ribbon across the corner of someone who has died; a white one for a child who died at birth. */
  showRibbons: boolean;
}

/** Where the shield stands on a card (CardSettings.emblemAlign). */
export type EmblemAlign = 'top' | 'center';
export const EMBLEM_ALIGN_VALUES: readonly EmblemAlign[] = ['top', 'center'];

/** How far a print or the chart reaches: a number of generations or steps, or everything. */
export type Reach = number | 'all';

/** How the chart is drawn. Saved in the file. Settings of earlier versions are not read and not written back. */
export interface ViewSettings extends CardSettings {
  /**
   * The language of the words on the chart when the tree was saved, as a BCP 47 tag ('en', 'cs'). The app
   * has one language, a setting of the browser, and writes it here when it saves.
   */
  language: string;
  /**
   * How far out to the sides the chart reaches from the direct line of the person in the middle: 0 is the
   * direct line only, 1 adds siblings, aunts, uncles, nieces and nephews, 2 first cousins, 3 second cousins.
   */
  branches: Reach;
  /** With `branches` at 'all': whether the families of those who married in are shown too (see PrintSettings). */
  inLawFamilies: boolean;
  /** With `branches` 1: brothers and sisters only, without aunts, uncles, nieces and nephews. */
  siblingsOnly: boolean;
  /**
   * The Polish and the Czech spelling of a surname count as one family (Nowak and Novák; see surnameKey): one
   * colour, one entry among the family names, one group in the list of people. On the chart and in prints.
   */
  uniteSpellings: boolean;
  /**
   * The German and the Czech spelling of a surname count as one family too (Schmidt and Šmíd, Schwarz and Švarc,
   * Müller and Mueller; see unitedKey). Letters with and without their marks are one family always.
   */
  uniteForeign: boolean;
  /**
   * On the chart (not in prints): a soft background in the family's colour behind its cards, so that the cards
   * of one family that stand together read as one patch.
   */
  familyBackgrounds: boolean;
  /**
   * On the chart (not in prints): how each person is related to the one the tree is centred on ("Aunt",
   * "Cousin"), on a line at the top of their card. Centring on someone else changes these and moves nobody.
   */
  showRelationships: boolean;
  ext?: Extensions;
}

export type Orientation = 'auto' | 'portrait' | 'landscape';

/** Line height to letter size: a line of text is this many times as high as its letters (PrintSettings.titleSize). */
export const LINE_HEIGHT = 1.2;
/** The line heights the title and the families' names may be given, in centimetres (PrintSettings.titleSize). */
export const LETTERING_CM = { min: 0.3, max: 12 } as const;
/** Between the title and the families' names held under it (PrintSettings.legendGap), in centimetres: as it comes, and the most. */
export const LEGEND_GAP_CM = 0.5;
export const LEGEND_GAP_MAX = 20;

/** How the tree is printed and exported. Saved in the file. Settings of earlier versions are not read and not written back. */
/** The gaps between cards and round lines that can be asked for (PrintSettings.cardGap, lineGap), in hundredths of a card's width. */
export const GAP_PERCENT = { min: 1, max: 40 } as const;

export const HEAD_ALIGN_VALUES = ['left', 'center', 'right'] as const;
export type HeadAlign = (typeof HEAD_ALIGN_VALUES)[number];

/**
 * How far a card was moved by hand, in the layout's units: `x`, `y` with what hangs under it (its partner, their
 * children), and `sx`, `sy` on its own (dragged with Ctrl), nothing else following.
 */
export interface CardMove {
  x: number;
  y: number;
  sx?: number;
  sy?: number;
}

export interface PrintSettings extends CardSettings {
  /** 'A4', 'A3', 'A2', 'A1', 'A0', 'letter', 'tabloid', or 'fit' for a page the size of the tree. */
  paper: string;
  orientation: Orientation;
  /** The person the page is drawn around. The home person when not set. */
  centerId?: string;
  /** Their partner beside them. Chosen automatically when undefined; null for nobody. */
  partnerId?: string | null;
  /** Families as close together as they go, with the least room between cards and lines: bigger cards, a busier page. */
  tight: boolean;
  /**
   * The gap between cards side by side, in hundredths of a card's width (as `tight` has it when not set). Between
   * families it is two and a half times that; between partners as much, and never less than their marker needs.
   */
  cardGap?: number;
  /** How far lines keep from the cards they pass and come out of, in hundredths of a card's width (as `tight` has it when not set). */
  lineGap?: number;
  /**
   * A much longer search for the arrangement of the families that leaves the least of the page empty: families
   * are spread out of their columns into room that would stay white, wherever that makes the cards bigger.
   */
  fill: boolean;
  /**
   * In a column of children, a couple with nobody under them stands one over the other (and the oldest couple of
   * a line may too). Off, every couple stands side by side.
   */
  stackCouples: boolean;
  /** Someone with several partners stands between them. Off, their partners all stand on one side where the family hangs at the side of a line. */
  amidPartners: boolean;
  /** The words on the cards a size bigger: the cards are taller for it, and as wide as ever. */
  largeText: boolean;
  /** The lines between the cards heavier and the marks between partners (married, divorced…) bigger. */
  strongLines: boolean;
  /**
   * A card whose names do not fit it is made as wide as they need (up to half as wide again); every other card
   * keeps the one width, and all keep the one height. Off, every card is the same size and long names are cut short.
   */
  freeWidths: boolean;
  /** Generations of parents above the couple. */
  ancestors: Reach;
  /** Generations of children below the couple. */
  descendants: Reach;
  /** Side branches (see ViewSettings.branches). */
  branches: Reach;
  /**
   * With `branches` at 'all': whether the families of those who married in are shown too. When false, only
   * people the chart has a relationship name for are shown (mother, cousin, sister-in-law, niece's fiancé),
   * with their partners; a sister-in-law's parents or a fiancé's grandparents are left out.
   */
  inLawFamilies: boolean;
  /** With `branches` 1: brothers and sisters only. */
  siblingsOnly: boolean;
  /** Overrides the tree's title on the page. */
  title?: string;
  /** Overrides the line under the title. */
  subtitle?: string;
  /** The title across the top of the page, with the counts and the date beside it. */
  showTitle: boolean;
  /** The families' names with their shields. */
  showLegend: boolean;
  /** A heading with an ornament over the families' names. */
  legendHeading: boolean;
  /** Where the heading stands over the names: at their left, in the middle (when not set) or at their right; only as wide as its word. */
  legendHeadAlign?: HeadAlign;
  /** How wide the heading and its rule are, in centimetres (as wide as its word needs when not set); never wider than the names. */
  legendHeadWidth?: number;
  /**
   * The families' names (and the title) keep a place of their own that no card may stand on: the tree is fitted
   * round them. Off, the tree is fitted to the whole page and they go into room left over, over the margin or a
   * gap, as the cards allow.
   */
  legendBlocks: boolean;
  /** A second page after the print that lists these settings (and where the title and the families' names stand), so the same print can be made again. */
  settingsPage: boolean;
  /** Which of the arrangements offered when several fit about as well is taken (0, the biggest cards, when not set). */
  layoutChoice?: number;
  /** The frame round the page with its corner flourishes. */
  showFrame: boolean;
  /** People hidden from prints are printed all the same. */
  showHidden: boolean;
  /**
   * Where the families' names (the legend) go when placed by hand: a box on the page, as shares of its width
   * and height, which the names are fitted into. Under the tree when not set.
   */
  legendBox?: LegendBox;
  /**
   * The families' names held at a place on the page inside its margin: a corner, the middle of a side, the
   * middle. They stay there whatever size they are. With `legendBox` set too, that box (its size; where it
   * was does not matter) is held there; without, the names stand as a block just big enough for them.
   */
  legendAnchor?: Anchor;
  /** Where the names stand in a box bigger than they need (`legendBox`): in a corner of it, along a side, in the middle (when not set). */
  legendAlign?: Anchor;
  /**
   * How far the names held at the top of the page (or at its foot) keep from the title when the two would meet
   * there, in centimetres on paper: the names then stand under the title (or over it). LEGEND_GAP_CM when not set.
   */
  legendGap?: number;
  /** Where the title is, when it has been moved by hand: the middle of it across and its top, as shares of the page. */
  titleAt?: { x: number; y: number };
  /** The title held at a place on the page inside its margin (and `titleAt` not used): it stays there whatever size it is. Top middle when neither is set. */
  titleAnchor?: Anchor;
  /**
   * Cards moved by hand, by person id: how far from where the layout put them, in the layout's units (a card
   * is 188 wide). The lines to a moved card follow it.
   */
  moves?: Readonly<Record<string, CardMove>>;
  /**
   * Lines led by hand, by line (`family|child`): their points in the layout's units, start to end. The two ends
   * stay with the marker and the card wherever they go; the bends in between stay where they were put.
   */
  lineBends?: Readonly<Record<string, readonly { x: number; y: number }[]>>;
  /**
   * People brought onto the print by hand, by id, from a card's menu (its parents, brothers and sisters, whole
   * family), whatever the reach above leaves out: the parents of a former partner, say.
   */
  added?: readonly string[];
  /** People whose partners stand on the other side of them, by id (see LayoutOptions.flipped); asked from a card's menu. */
  flipped?: readonly string[];
  /** How each couple stands, as a word at their marker: "married", "divorced". */
  unionText: boolean;
  /**
   * The PDF in pieces on sheets of this paper (an id from PAPERS), to be glued together into one, as two A3
   * make an A2 (see tileGrid). One sheet when not set.
   */
  tiles?: string;
  /** With `tiles`: the printer prints to the edge of the paper, so the sheets join edge to edge at full size. */
  tilesBorderless?: boolean;
  /**
   * The title's line height on paper, in centimetres (its letters are a fifth smaller, see LINE_HEIGHT); the
   * rest of the page's lettering in proportion. Sized to the page and the cards when not set.
   */
  titleSize?: number;
  /** The families' names' line height on paper, in centimetres. Sized to the page and the cards when not set. */
  legendSize?: number;
  ext?: Extensions;
}

/** A place on the page, or in a box: a corner, the middle of a side, or the middle. */
export type Anchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

/** The anchors row by row, as they lie on a page. */
export const ANCHOR_VALUES: readonly Anchor[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

/** An anchor as shares across and down: 0 at the left or the top, 0.5 in the middle, 1 at the right or the foot. */
export function anchorShares(anchor: Anchor): { x: number; y: number } {
  return {
    x: anchor.endsWith('left') ? 0 : anchor.endsWith('right') ? 1 : 0.5,
    y: anchor.startsWith('top') ? 0 : anchor.startsWith('bottom') ? 1 : 0.5,
  };
}

/** A box on the printed page, its corner and size as shares (0 to 1) of the page's width and height. */
export interface LegendBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreeDocument {
  meta: TreeMeta;
  view: ViewSettings;
  people: Person[];
  families: Family[];
  /** Print and export settings; defaults apply until someone prints. */
  print?: PrintSettings;
  /**
   * Print settings kept for particular people, one each (by their centerId): choosing that person for the middle
   * of the page in the print studio brings them back.
   */
  savedPrints?: PrintSettings[];
  /** Unknown root attributes and top-level sections. */
  ext?: Extensions;
  /** Unknown attributes and elements inside <people> and <families>. */
  sectionExt?: { people?: Extensions; families?: Extensions };
}

export const DEFAULT_CARDS: CardSettings = {
  showEmblems: true,
  showBirthNames: true,
  unknownBirthNames: true,
  dates: 'years',
  emblemAlign: 'center',
  sexColors: true,
  showRibbons: true,
};

/** View settings for attributes missing from a file. */
export const DEFAULT_VIEW: ViewSettings = {
  ...DEFAULT_CARDS,
  language: 'en',
  branches: 'all',
  inLawFamilies: true,
  siblingsOnly: false,
  uniteSpellings: true,
  uniteForeign: true,
  familyBackgrounds: false,
  showRelationships: true,
};

/** View settings for a tree started in this version. */
export const NEW_TREE_VIEW: ViewSettings = { ...DEFAULT_VIEW };

export const DEFAULT_PRINT: PrintSettings = {
  ...DEFAULT_CARDS,
  paper: 'A3',
  orientation: 'auto',
  tight: false,
  fill: false,
  stackCouples: false,
  amidPartners: true,
  largeText: false,
  strongLines: false,
  freeWidths: false,
  unionText: false,
  ancestors: 'all',
  descendants: 'all',
  branches: 'all',
  inLawFamilies: true,
  siblingsOnly: false,
  showTitle: true,
  showLegend: true,
  legendHeading: true,
  legendBlocks: false,
  settingsPage: true,
  showFrame: true,
  showHidden: false,
};

/** Print settings before anything was chosen: the cards and the relatives shown are those of the chart. */
export function printDefaults(view: ViewSettings): PrintSettings {
  return {
    ...DEFAULT_PRINT,
    branches: view.branches,
    inLawFamilies: view.inLawFamilies,
    siblingsOnly: view.siblingsOnly,
    showEmblems: view.showEmblems,
    showBirthNames: view.showBirthNames,
    unknownBirthNames: view.unknownBirthNames,
    dates: view.dates,
    emblemAlign: view.emblemAlign,
    sexColors: view.sexColors,
    showRibbons: view.showRibbons,
  };
}

/** The print settings in effect for a document. */
export function effectivePrint(doc: Pick<TreeDocument, 'print' | 'view'>): PrintSettings {
  return doc.print ?? printDefaults(doc.view);
}

export function emptyDocument(title = 'My family tree', now = new Date()): TreeDocument {
  const stamp = now.toISOString();
  return {
    meta: { title, created: stamp, modified: stamp },
    view: { ...NEW_TREE_VIEW },
    people: [],
    families: [],
  };
}

export const SEX_VALUES: readonly Sex[] = ['female', 'male', 'other', 'unknown'];
export const QUALIFIER_VALUES: readonly DateQualifier[] = ['about', 'before', 'after', 'estimated', 'calculated'];
export const FAMILY_KIND_VALUES: readonly FamilyKind[] = ['marriage', 'partnership', 'unknown'];
export const CHILD_RELATION_VALUES: readonly ChildRelation[] = ['biological', 'adopted', 'foster', 'step', 'unknown'];
export const END_REASON_VALUES: readonly FamilyEndReason[] = ['divorce', 'separation', 'annulment', 'death', 'other'];
export const DATE_STYLE_VALUES: readonly DateStyle[] = ['none', 'years', 'full'];
export const ORIENTATION_VALUES: readonly Orientation[] = ['auto', 'portrait', 'landscape'];
