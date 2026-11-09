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

export type TreeStyle = 'auto' | 'archive' | 'print' | 'night';
export type ColorBy = 'family' | 'generation' | 'sex' | 'none';
export type LineStyle = 'square' | 'curved';
export type Density = 'comfortable' | 'compact';

/**
 * How the chart is drawn. Saved in the file so a tree reopens looking the same.
 * Settings marked "no longer used" are read, kept and written back, for the
 * versions of the app that use them (see schema/stemma-1.xsd).
 */
export interface ViewSettings {
  /** No longer used: light or dark is a setting of the app, kept in the browser (state/theme.ts). */
  style: TreeStyle;
  /** No longer used: the name shields are always coloured by family. */
  colorBy: ColorBy;
  /** Square or curved lines, on the chart and in prints. */
  lines: LineStyle;
  /** No longer used: every tree is drawn with the same spacing. */
  density: Density;
  showDates: boolean;
  /** No longer used: the chart does not show places; prints have their own setting. */
  showPlaces: boolean;
  showPhotos: boolean;
  showGenerations: boolean;
  /** Relationship names on the cards (Mother, Cousin...), relative to the home person. Format 1.1. */
  showRelationships: boolean;
  /** No longer used: every couple has a note saying how they stand. Format 1.1. */
  showUnions: boolean;
  /** A symbol for each person's sex in the corner of their card. Format 1.2. */
  showSex: boolean;
  /** Cards tinted by sex: blue for men, rose for women. Format 1.2. */
  sexColors: boolean;
  /**
   * No longer used on the chart, which has nothing behind it; the default for
   * the drawn tree (or picture) behind the family in prints. Format 1.2.
   */
  showTree: boolean;
  /**
   * The language of the words on the chart when the tree was saved, as a BCP 47
   * tag ('en', 'cs'). The app has one language, a setting of the browser, and
   * writes it here when it saves; older versions draw the chart in it. Format 1.1.
   */
  language: string;
  /**
   * How far out to the sides the chart reaches from the direct line of the
   * person in the middle, as `branches` in PrintSettings. Format 1.4.
   */
  branches: Reach;
  /** With `branches` at 'all': whether the families of those who married in are shown too (see PrintSettings). Format 1.4. */
  inLawFamilies: boolean;
  /** With `branches` 1: brothers and sisters only, without aunts, uncles, nieces and nephews. Format 1.6. */
  siblingsOnly: boolean;
  /**
   * The widest generations are drawn in two tiers, every other card a step
   * lower, while the chart is much wider than it is tall. Format 1.6.
   */
  tallGenerations: boolean;
  /** No longer used: brothers and sisters always stand in birth order. Kept and written back. Format 1.6. */
  childlessOutside: boolean;
  /**
   * Dates on the cards in full, as numbers ("17. 5. 1923 – 3. 11. 2001"), where
   * the day or month is known and the card has room; years otherwise. Format 1.6.
   */
  fullDates: boolean;
  ext?: Extensions;
}

export type Orientation = 'auto' | 'portrait' | 'landscape';

/** How far a print reaches: a number of generations or steps, or everything. */
export type Reach = number | 'all';

/** How the tree is printed and exported. Saved in the file (format 1.1). */
export interface PrintSettings {
  /** Print style, e.g. 'heirloom'. Styles this version does not have are kept and drawn with the default. */
  theme: string;
  /** 'A4', 'A3', 'A2', 'A1', 'A0', 'letter', 'tabloid', or 'fit' for a page the size of the tree. */
  paper: string;
  orientation: Orientation;
  /** The person in the middle of the page. The home person when not set. */
  centerId?: string;
  /** Their partner beside them. Chosen automatically when undefined; null for nobody. */
  partnerId?: string | null;
  /** Keep the couple exactly in the middle of the page, even if one side of the family is bigger. */
  centered: boolean;
  /** Generations of parents above the couple. */
  ancestors: Reach;
  /** Generations of children below the couple. */
  descendants: Reach;
  /**
   * Side branches: 0 is the direct line only, 1 adds siblings, aunts, uncles,
   * nieces and nephews, 2 adds first cousins, 3 second cousins.
   */
  branches: Reach;
  /**
   * With `branches` at 'all': whether the families of those who married in are
   * shown too. When false, only people the chart has a relationship name for
   * are shown (mother, cousin, sister-in-law, niece's fiancé), with their
   * partners; a sister-in-law's parents or a fiancé's grandparents are left
   * out. Nearer branches leave them out anyway. Format 1.4.
   */
  inLawFamilies: boolean;
  /** Overrides the tree's title on the page. */
  title?: string;
  /** Overrides the line under the title. */
  subtitle?: string;
  showDates: boolean;
  /** No longer used: prints do not show places. Kept and written back. */
  showPlaces: boolean;
  showPhotos: boolean;
  /** No longer used: every couple has a note saying how they stand. */
  showUnions: boolean;
  showRelationships: boolean;
  showGenerations: boolean;
  /** Format 1.2. */
  showSex: boolean;
  /** Format 1.2. */
  sexColors: boolean;
  /** Format 1.2. */
  showTree: boolean;
  /** Portraits (and the badges in their place) round, square or upright rectangles. Format 1.5. */
  portrait: PortraitShape;
  /** The portrait and the lines of text at the top of the card, or in the middle of it. Format 1.5. */
  portraitAlign: PortraitAlign;
  /** How big the portraits (and the badges in their place) are, against the style's own size: 1 is as designed. Format 1.5. */
  portraitSize: number;
  /**
   * Couples without children take the room of one card: the partner who
   * married in is drawn small over the top right corner of the other's card.
   * Format 1.6.
   */
  compactCouples: boolean;
  /**
   * Taller and narrower: with compactCouples the partner of a childless couple
   * is stacked under the card instead of over its corner, and generations are
   * drawn in two tiers more readily (more of them, for a smaller gain in size).
   * Format 1.6.
   */
  tallGenerations: boolean;
  /** People hidden from prints are printed all the same. Format 1.6. */
  showHidden: boolean;
  /** No longer used (see ViewSettings). Format 1.6. */
  childlessOutside: boolean;
  /** Dates on the cards in full, as numbers, where known and where they fit (see ViewSettings). Format 1.6. */
  fullDates: boolean;
  /** With `branches` 1: brothers and sisters only (see ViewSettings). Format 1.6. */
  siblingsOnly: boolean;
  ext?: Extensions;
}

export type PortraitShape = 'round' | 'square' | 'rectangle';
/** Portraits are stored a little taller than wide (height over width), so prints can show them as upright rectangles. */
export const PORTRAIT_ASPECT = 4 / 3;
export type PortraitAlign = 'top' | 'middle';
export const PORTRAIT_SHAPE_VALUES: readonly PortraitShape[] = ['round', 'square', 'rectangle'];
export const PORTRAIT_ALIGN_VALUES: readonly PortraitAlign[] = ['top', 'middle'];

export type BackgroundFit = 'cover' | 'contain';

/**
 * A picture of the person's own behind the printed family, instead of the
 * drawn tree (format 1.3). Shown where the print settings' `showTree` is on.
 */
export interface BackgroundImage {
  /** The picture as a data: URL (SVG, PNG, JPEG or WebP; a PDF is converted when it is chosen). */
  href: string;
  /** Its size in pixels (an SVG's own units), for placing it. */
  width: number;
  height: number;
  /** cover: fills the area behind the chart, cropping what sticks out; contain: shows the whole picture. */
  fit: BackgroundFit;
  /** 0 to 1. */
  opacity: number;
  /** The file it came from. */
  name?: string;
  ext?: Extensions;
}

/**
 * Changes made by hand to the automatic layout, kept with the tree: couples
 * moved sideways, family lines moved up or down, and couples turned round.
 * They apply on top of the layout as the tree changes, on the chart and in
 * prints. Entries for people or families no longer in the tree are ignored.
 * Format 1.4.
 */
export interface Arrangement {
  /** How far each person's card is moved sideways from where the layout puts it, in chart units. A couple moves together. */
  moves: Readonly<Record<string, number>>;
  /** How far each family's line (the bar its children hang from) is moved down; up when negative. */
  lines: Readonly<Record<string, number>>;
  /** For couples turned round by hand: the partner drawn on the left, by family. */
  left: Readonly<Record<string, string>>;
  ext?: Extensions;
}

export interface TreeDocument {
  meta: TreeMeta;
  view: ViewSettings;
  people: Person[];
  families: Family[];
  /** Print and export settings; defaults apply until someone prints. */
  print?: PrintSettings;
  /** A picture behind the chart instead of the drawn tree. */
  background?: BackgroundImage;
  /** Changes made by hand to the layout. Format 1.4. */
  arrangement?: Arrangement;
  /** Unknown root attributes and top-level sections. */
  ext?: Extensions;
  /** Unknown attributes and elements inside <people> and <families>. */
  sectionExt?: { people?: Extensions; families?: Extensions };
}

/**
 * View settings for attributes missing from a file. These are part of the file
 * format and must not change within a major version.
 */
export const DEFAULT_VIEW: ViewSettings = {
  style: 'auto',
  colorBy: 'family',
  lines: 'square',
  density: 'comfortable',
  showDates: true,
  showPlaces: false,
  showPhotos: true,
  showGenerations: true,
  showRelationships: true,
  showUnions: true,
  language: 'en',
  showSex: true,
  sexColors: false,
  showTree: true,
  branches: 'all',
  inLawFamilies: true,
  tallGenerations: false,
  childlessOutside: false,
  fullDates: false,
  siblingsOnly: false,
};

/** View settings for a tree started in this version. */
export const NEW_TREE_VIEW: ViewSettings = { ...DEFAULT_VIEW, showPlaces: true, sexColors: true };

export const DEFAULT_PRINT: PrintSettings = {
  theme: 'heirloom',
  paper: 'A3',
  orientation: 'auto',
  centered: true,
  ancestors: 'all',
  descendants: 'all',
  branches: 'all',
  inLawFamilies: true,
  showDates: true,
  showPlaces: true,
  showPhotos: true,
  showUnions: true,
  showRelationships: true,
  showGenerations: true,
  showSex: true,
  sexColors: false,
  showTree: true,
  portrait: 'round',
  portraitAlign: 'middle',
  portraitSize: 1,
  compactCouples: false,
  tallGenerations: false,
  showHidden: false,
  childlessOutside: false,
  fullDates: false,
  siblingsOnly: false,
};

/** Print settings before anything was chosen: the cards and the relatives shown are those of the chart. */
export function printDefaults(view: ViewSettings): PrintSettings {
  return {
    ...DEFAULT_PRINT,
    branches: view.branches,
    inLawFamilies: view.inLawFamilies,
    showDates: view.showDates,
    showPlaces: view.showPlaces,
    showPhotos: view.showPhotos,
    showUnions: view.showUnions,
    showRelationships: view.showRelationships,
    showGenerations: view.showGenerations,
    showSex: view.showSex,
    sexColors: view.sexColors,
    showTree: view.showTree,
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
export const TREE_STYLE_VALUES: readonly TreeStyle[] = ['auto', 'archive', 'print', 'night'];
export const COLOR_BY_VALUES: readonly ColorBy[] = ['family', 'generation', 'sex', 'none'];
export const LINE_STYLE_VALUES: readonly LineStyle[] = ['square', 'curved'];
export const DENSITY_VALUES: readonly Density[] = ['comfortable', 'compact'];
export const ORIENTATION_VALUES: readonly Orientation[] = ['auto', 'portrait', 'landscape'];
export const BACKGROUND_FIT_VALUES: readonly BackgroundFit[] = ['cover', 'contain'];
