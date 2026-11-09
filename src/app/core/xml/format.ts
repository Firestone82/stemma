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
export const APP_VERSION = '1.7.0';

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
 */
export const CURRENT_FORMAT: FormatVersion = { major: 1, minor: 7 };

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
