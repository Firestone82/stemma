/**
 * Stemma family tree XML format.
 *
 * Versioning (see schema/stemma-1.xsd):
 * - `formatVersion="MAJOR.MINOR"` on the root element.
 * - A MINOR release only adds optional elements or attributes. Readers ignore what
 *   they do not know and keep it, so saving in an older app loses nothing.
 * - A MAJOR release may restructure the file. Newer apps read every older major
 *   version through the migrations in migrations.ts; older apps refuse newer
 *   major versions instead of guessing.
 * - The namespace never changes between versions.
 */
export const XML_NAMESPACE = 'urn:stemma:family-tree';
export const ROOT_ELEMENT = 'familyTree';

export const APP_NAME = 'Stemma';
export const APP_VERSION = '1.8.0';

export interface FormatVersion {
  major: number;
  minor: number;
}

/**
 * 1.0  First format.
 * 1.1  Adds <engagement> to <family>; showRelationships, showUnions and
 *      language to <view>; and <print> with print settings.
 * 1.2  Adds showSex, sexColors and showTree to <view> and <print>.
 * 1.3  Adds <background> (a picture behind the chart) and birthGroup on
 *      <child> (twins, triplets).
 * 1.4  Adds branches and inLawFamilies to <view>, and inLawFamilies to
 *      <print>: how far out to the sides of the family the chart and prints go.
 * 1.5  Adds portrait, portraitAlign and portraitSize to <print>: portraits
 *      round, square or upright rectangles, at the top of the cards or in the
 *      middle, and how big.
 * 1.6  Adds print="hidden" on <person>: people left out of prints;
 *      compactCouples, tallGenerations, showHidden, fullDates and siblingsOnly
 *      to <print>; tallGenerations, fullDates and siblingsOnly to <view>; and
 *      childlessOutside to both, no longer used.
 * 1.7  Adds givenUnknown on <name> and dateUnknown on events: nobody knows the
 *      given name or the date, so they are not gaps to fill in.
 * 1.8  Adds legendBox to <print>: the families' names placed by hand on the
 *      page; packFamilies: generations need not stand in rows;
 *      sidewaysBranches, sidewaysOn and sidewaysOff: branches drawn left to
 *      right, where that helps or by hand; and
 *      showEmblems: cards without the family's emblem; and tiles and
 *      tilesBorderless: the PDF in pieces on smaller sheets; titleSize and
 *      legendSize: the line height of the title and of the families' names,
 *      in centimetres.
 * 1.9  One way of drawing the tree and one print style. <view> and <print> say what the cards show
 *      (showEmblems, showBirthNames, dates, showSex, sexColors, showRibbons) and, for prints, which parts
 *      of the page there are (showTitle, showLegend, showFrame). The settings of the earlier
 *      ways of drawing (styles, the drawn tree, generations in rows, stacked couples, sideways branches,
 *      relationship names, portraits), <background> and <arrangement> are no longer read, and are gone
 *      from a file once it is saved. People and families are as they were. Later in 1.9: moves (cards
 *      moved by hand), added (people brought onto the print by hand) and
 *      flipped (couples with their partners swapped from side to side) on <print>; surnameFrom
 *      on <name>: the marriage whose husband's surname a woman married more than once bears; and
 *      showRelationships on <view> again: how everyone is related to the person in the middle, on the
 *      chart's cards (the chart is drawn the same whoever that is).
 *      <savedPrints>: print settings kept for particular people, a <print> for each (its center).
 *      <part>: in a file holding a part of a tree taken out to be filled in elsewhere, how its people
 *      and families were then, so that merging it back can tell which side changed what.
 */
export const CURRENT_FORMAT: FormatVersion = { major: 1, minor: 9 };

export function formatVersionString(v: FormatVersion = CURRENT_FORMAT): string {
  return `${v.major}.${v.minor}`;
}

/** Accepts "1", "1.0", "1.2" (and tolerates a patch part such as "1.2.3"). */
export function parseFormatVersion(text: string | null | undefined): FormatVersion | null {
  const m = /^\s*(\d+)(?:\.(\d+))?(?:\.\d+)?\s*$/.exec(text ?? '');
  if (!m) return null;
  return { major: Number(m[1]), minor: m[2] === undefined ? 0 : Number(m[2]) };
}

export function compareFormat(a: FormatVersion, b: FormatVersion): number {
  return a.major - b.major || a.minor - b.minor;
}

export const GENERATOR = `${APP_NAME} ${APP_VERSION}`;
