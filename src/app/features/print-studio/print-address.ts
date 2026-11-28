import { PrintSettings } from '../../core/model/types';

/** The address of the print studio: the app's address with this after it, then the person and the settings (see printAddress). */
export const PRINT_HASH = '#/print';

/** Whether an address (location.hash) is the print studio's. */
export function isPrintHash(hash: string): boolean {
  return hash === PRINT_HASH || hash.startsWith(PRINT_HASH + '?');
}

/** The parameter that names the person the page is drawn around (PrintSettings.centerId): first, and shorter. */
const PERSON = 'person';

/**
 * Every print setting, as it goes into the address. Cards moved and lines led by hand (and what other programs
 * keep) stay out: they are long, and belong to the page they were made on. Written out in full so that a setting
 * added to PrintSettings has to be added here as well.
 */
const IN_ADDRESS: { readonly [K in keyof PrintSettings]-?: boolean } = {
  showEmblems: true,
  showBirthNames: true,
  unknownBirthNames: true,
  dates: true,
  emblemAlign: true,
  sexColors: true,
  showRibbons: true,
  paper: true,
  orientation: true,
  centerId: true,
  partnerId: true,
  tight: true,
  cardGap: true,
  lineGap: true,
  fill: true,
  stackCouples: true,
  amidPartners: true,
  largeText: true,
  strongLines: true,
  freeWidths: true,
  ancestors: true,
  descendants: true,
  branches: true,
  inLawFamilies: true,
  siblingsOnly: true,
  title: true,
  subtitle: true,
  showTitle: true,
  showLegend: true,
  legendHeading: true,
  legendHeadAlign: true,
  legendHeadWidth: true,
  legendBlocks: true,
  legendFrameClear: true,
  settingsPage: true,
  layoutChoice: true,
  showFrame: true,
  showDecorations: true,
  showHidden: true,
  legendBox: true,
  legendAnchor: true,
  legendAlign: true,
  legendGap: true,
  titleAt: true,
  titleAnchor: true,
  moves: false,
  lineBends: false,
  gaps: true,
  added: true,
  flipped: true,
  unionText: true,
  tiles: true,
  tilesBorderless: true,
  titleSize: true,
  legendSize: true,
  ext: false,
};

/** The settings the address carries, in a fixed order. */
export const ADDRESS_KEYS = (Object.keys(IN_ADDRESS) as (keyof PrintSettings)[]).filter((key) => IN_ADDRESS[key]);

/**
 * A value as it is written into the address: text as it is (unless it would be read back as something else,
 * "12" or "true"), anything else as JSON.
 */
function write(value: unknown): string {
  if (typeof value === 'string') return isJson(value) ? JSON.stringify(value) : value;
  return JSON.stringify(value);
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function read(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Whether a value read from the address is of the kind a setting with this default takes ('all' or a number for a reach). */
function fits(value: unknown, want: unknown): boolean {
  if (want === undefined || typeof value === typeof want) return true;
  const reach = (v: unknown) => v === 'all' || typeof v === 'number';
  return reach(want) && reach(value);
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * The print studio's address for these settings (#/print?person=I1&paper=A2…): the person the page is drawn
 * around (`person`, the home person when the settings name nobody) and every setting that differs from
 * `defaults`, so the address stays short and a setting left as it was stays out of it.
 */
export function printAddress(settings: PrintSettings, defaults: PrintSettings, person?: string): string {
  const params = new URLSearchParams();
  const center = settings.centerId ?? person;
  if (center) params.set(PERSON, center);
  for (const key of ADDRESS_KEYS) {
    if (key === 'centerId') continue;
    const value = settings[key];
    if (value === undefined || same(value, defaults[key])) continue;
    params.set(key, write(value));
  }
  const query = params.toString();
  return query ? `${PRINT_HASH}?${query}` : PRINT_HASH;
}

/**
 * What a print studio's address says (see printAddress): the person and the settings it names, as a change of the
 * print settings. Null for an address that is not the studio's. A setting the address does not know is skipped;
 * one whose value is not of the kind the setting takes is skipped too.
 */
export function readPrintAddress(hash: string, defaults: PrintSettings): Partial<PrintSettings> | null {
  if (!isPrintHash(hash)) return null;
  const query = hash.slice(PRINT_HASH.length + 1);
  const params = new URLSearchParams(query);
  const known = new Set<string>(ADDRESS_KEYS);
  const out: Record<string, unknown> = {};
  for (const [name, text] of params) {
    const key = name === PERSON ? 'centerId' : name;
    if (!known.has(key) || name === 'centerId') continue;
    const value = key === 'centerId' ? text : read(text);
    if (!fits(value, defaults[key as keyof PrintSettings])) continue;
    out[key] = value;
  }
  return out as Partial<PrintSettings>;
}

/**
 * The change that makes `current` into the settings an address says (from readPrintAddress), over `defaults`:
 * every setting the address carries that it does not name goes back to its default. Cards moved and lines led by
 * hand are left as they are (PrintModel.set lets them go when the layout changes).
 */
export function addressPatch(current: PrintSettings, wanted: Partial<PrintSettings>, defaults: PrintSettings): Partial<PrintSettings> {
  const patch: Record<string, unknown> = {};
  for (const key of ADDRESS_KEYS) {
    const value = key in wanted ? wanted[key] : defaults[key];
    if (!same(value, current[key])) patch[key] = value;
  }
  return patch as Partial<PrintSettings>;
}
