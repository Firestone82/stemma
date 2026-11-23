/**
 * Draws a printable page of the tree: the part of the tree chosen in the print settings, laid out to fill
 * the sheet with cards as big as the paper allows, in the Heritage style. The result is a standalone SVG
 * string; exporting turns it into PNG or PDF.
 */
import { CardDesign, CardParts, GHOST_DASH, LARGE_TEXT, UNKNOWN_DASH, accentOf, cardDesign, cardLines, ribbonPath } from '../card/card-design';
import { LegendEntry, Tincture, assignColors } from '../colors/tinctures';
import { chartLanguage, surnameLinesIn } from '../lang/language';
import { Layouter } from '../layout/engine';
import { Fitted, Room, fitLayoutSteps, fitShapesSteps, place } from '../layout/fit';
import { Steps, finish } from '../layout/steps';
import { RELATION_DASH, roundedPath, sharedPaths } from '../layout/lines';
import { applyBends, applyMoves } from '../layout/moves';
import { LAYOUT, LayoutCard, LayoutOptions, LayoutResult, TIGHT_LAYOUT } from '../layout/types';
import { unionMark } from '../layout/union-marks';
import { diedAtBirth } from '../model/completeness';
import { dateYear } from '../model/dates';
import { initials, nameUnknown } from '../model/names';
import { isBrokenUp, relationshipStatus } from '../model/relationship';
import { birthSurname, birthSurnameUnknown } from '../model/surnames';
import { TreeIndex } from '../model/tree-index';
import { Anchor, DEFAULT_PRINT, LEGEND_GAP_CM, LETTERING_CM, LINE_HEIGHT, PrintSettings, TreeDocument, anchorShares, effectivePrint } from '../model/types';
import { GOLD, LETTERING, MARGIN, SERIF, heritage, palette, tinctures } from './heritage';
import { drawMark } from './marks';
import { PX_PER_MM, paperSize } from './paper';
import { FontSpec, PageBlock, PosterContext, Rect } from './poster-types';
import { ScopeOptions, scopeDocument } from './scope';
import { cssFont, el, fontAttrs, n, text } from './svg';

export interface PosterInput {
  doc: TreeDocument;
  /** Defaults to the document's print settings. */
  settings?: PrintSettings;
  /** Language of the words on the page, a BCP 47 tag. Defaults to the one the document was saved in. */
  language?: string;
  /** Width of a text in a CSS font (canvas measureText in the browser). */
  measure(text: string, font: string): number;
  now?: Date;
  /** People left out of this print only (clicked away in the studio); the person in the middle stays. */
  omit?: ReadonlySet<string>;
  /** How hard to look for the best arrangement: 'quick' for a preview while settings change. */
  effort?: 'full' | 'quick';
  /**
   * Whether to look for the other arrangements that come out about as well (PosterResult.layouts); true when not
   * set. Off, the page is drawn sooner, with only the best arrangement listed.
   */
  alternatives?: boolean;
  /** Tells what the work is doing now (a step and its details), for the note shown while a page takes long. */
  report?: (step: ProgressStep, detail?: Record<string, string | number>) => void;
}

/** What drawing a page is busy with, in the order it comes to it. */
export type ProgressStep = 'start' | 'orientation' | 'names' | 'lettering' | 'alternatives' | 'draw';

export interface PosterResult {
  svg: string;
  /** Page size in CSS pixels (96 per inch). */
  width: number;
  height: number;
  /** Physical size, unless the page is sized to the tree. */
  paper?: { widthMm: number; heightMm: number; landscape: boolean };
  /** The size names print at, in points. */
  namePt: number;
  /** How big one card comes out on paper, in millimetres. */
  cardMm: { w: number; h: number };
  /**
   * The line height of the title and of the families' names on paper, in centimetres (see PrintSettings.titleSize),
   * and what the page would make them by itself, to suit the sheet and the cards (the same, where no size is asked for).
   */
  lettering: { titleCm: number; legendCm: number; autoTitleCm: number; autoLegendCm: number };
  /** How much of the room for the tree the cards cover, 0 to 1. */
  coverage: number;
  /**
   * The arrangements of the tree that come out about as well as the one drawn (PrintSettings.layoutChoice picks
   * one): how big their cards are, as a share of the biggest, the biggest first. One entry when there is no other.
   */
  layouts: { ratio: number }[];
  /** Which of `layouts` is drawn. */
  layoutChoice: number;
  /** People on the page, and in the whole tree. */
  people: number;
  total: number;
  generations: number;
  centerId?: string;
  partnerId?: string;
  /**
   * Where the families' names are on the page, as shares of its width and height; `free` when placed by
   * hand or held at an anchor (PrintSettings.legendBox, legendAnchor) and not where the page puts them itself.
   */
  legend?: { x: number; y: number; w: number; h: number; free: boolean };
  /** Where the title is, the same way; `free` when moved by hand or held at an anchor (PrintSettings.titleAt, titleAnchor). Only on paper. */
  title?: { x: number; y: number; w: number; h: number; free: boolean };
  /** The page inside its margin, as shares of its width and height: what the title and the names are lined up with when moved. */
  inner: { x: number; y: number; w: number; h: number };
  /** Everyone on the page, by id. */
  shown: string[];
  /** The size of a card in the layout's units (what PrintSettings.moves is measured in). */
  cardUnits: { w: number; h: number };
  /**
   * The gaps the layout keeps between two cards side by side, in the layout's units: between partners, between
   * brothers and sisters, between families; and between a couple's cards one over the other. A card dragged
   * by hand next to another snaps to the one that fits the two.
   */
  gaps: { partner: number; sibling: number; family: number; stack: number };
  /**
   * The line from each child's parents to the child, whole, in the layout's units. On the page a stretch several
   * children share is drawn once; this is for finding everyone who hangs on a stretch that is clicked.
   */
  lines: { key: string; familyId: string; childId: string; points: { x: number; y: number }[] }[];
  /** All text on the page, for embedding font subsets. */
  text: string;
  /**
   * The families' names drawn into a box on this page (as shares of its width and height), as they would stand
   * there: the inside of the page's `g.pp-legend`. For showing them in a box being moved or made bigger or
   * smaller before the page is drawn again.
   */
  namesIn: (box: { x: number; y: number; w: number; h: number }, style?: NamesStyle) => string;
}

/** How the families' names are drawn into a box (PosterResult.namesIn). */
export interface NamesStyle {
  /** Where they stand in the box; as the print settings say when not given. */
  align?: Anchor;
  /** Their line height in centimetres; as the page sizes them when not given. The box never makes them bigger or smaller. */
  cm?: number;
}

/** Round the couple the page is drawn around: how far their frame stands from their cards, in the layout's units. */
const COUPLE_PAD = 8;
/** How far a line coming down onto the couple keeps from the middle of the crown on their frame, and how far the crown moves aside for it. */
const CROWN_CLEAR = 13;
const CROWN_STEP = 26;
/** How much heavier the lines are, and how much bigger the marks between partners, with PrintSettings.strongLines. */
const STRONG_LINES = 1.7;
const STRONG_MARKS = 1.3;
/** The gap between partners with the bigger marks: the widest mark, 33 units, and room either side of it. */
const STRONG_PARTNER_GAP = 44;
/** The least gap between partners for their marker to stand clear of both cards. */
const MARKER_GAP = 26;

/**
 * The gaps asked for in the print settings (PrintSettings.cardGap, lineGap: hundredths of a card's width), as
 * the layout's options. Families keep two and a half times the gap between cards; partners as much, but never
 * less than their marker needs.
 */
export function gapsFor(settings: PrintSettings, cardWidth: number): Partial<LayoutOptions> {
  const out: Partial<LayoutOptions> = {};
  if (settings.cardGap !== undefined) {
    const g = (settings.cardGap / 100) * cardWidth;
    out.siblingGap = g;
    out.familyGap = g * 2.5;
    out.stackGap = Math.max(4, g * 0.8);
    out.partnerGap = Math.max(g * 2.5, settings.strongLines ? STRONG_PARTNER_GAP : MARKER_GAP);
  }
  if (settings.lineGap !== undefined) {
    const l = (settings.lineGap / 100) * cardWidth;
    out.tick = l;
    out.stem = l;
    out.drop = l;
  }
  return out;
}

/** How far a line led again after cards were moved keeps from the cards it passes: as far as the layout keeps its lines. */
function lineClearance(options: LayoutOptions): number {
  return Math.max(6, options.stem * 0.75);
}

/** A tree is not blown up beyond this on big paper; it would look like a children's book. */
const MAX_SCALE = 2.1;
/**
 * The letters of the title and of the families' names when no size is asked for: so many times the given names
 * on the cards as they come out on the paper, but within these shares of the paper's shorter side. On a small
 * sheet the paper decides (a title a twenty-fourth of the sheet high); on a big sheet full of small cards the
 * lettering keeps to the cards, without shrinking to where it is lost on the sheet.
 */
const AUTO_LETTERS = {
  title: { names: 3.6, min: 0.022, max: 0.042 },
  legend: { names: 1.7, min: 0.009, max: 0.016 },
} as const;
/** The room a page sized to the tree is laid out for. */
const FIT_ROOM = { w: 1600, h: 1000 };
const NO_BLOCK: PageBlock = { height: 0, draw: () => '' };

interface CardText {
  given: string;
  surname: string;
  birth: string;
  dates: string;
  initials: string;
}

interface Placed {
  fitted: Fitted;
  landscape: boolean;
  page: PosterContext['page'];
  chart: Rect;
  header: PageBlock;
  footer: PageBlock;
  /** Where the page put the families' names when they were not placed by hand: in rows across the foot, or as a block in a corner. */
  names?: NamesPlace;
  /** What the tree was fitted into: for looking for other arrangements of it. */
  room?: Room;
}

/**
 * The families' names where the page puts them: rows across the foot, or a block of so many columns in a
 * corner. Or where they are held (PrintSettings.legendAnchor): a block of so many columns there.
 */
type NamesPlace = { at: 'foot' } | { at: Anchor; columns: number };
type Corner = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
const CORNERS: readonly Corner[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];
/** A block of names in a corner takes at most these shares of the page inside its margin. */
const NAMES_BLOCK = { w: 0.5, h: 0.45 };
/** The rows across the foot stay unless a corner makes the cards this much bigger. */
const NAMES_GAIN = 1.015;
/** How many corners are fitted in full (the most promising at a quick look), and how many trees each place is looked at with before that. */
const NAMES_TRIED = 1;
/** Other arrangements of the tree are offered when their cards come out at least this share of the biggest, up to so many (the best included), after looking at so many. */
const LAYOUT_SPREAD = 0.88;
const LAYOUTS_OFFERED = 4;
const LAYOUTS_LOOKED = 10;
/** The families' names are this much smaller than the page would size them: 0.05 cm of line height, about a point. */
const LEGEND_TRIM = (0.05 * 10 * PX_PER_MM) / LINE_HEIGHT;
const NAMES_TREES = 14;
/** A card whose names do not fit is made at most this many times the usual width (PrintSettings.freeWidths), in steps of so many units. */
const WIDEST_CARD = 1.5;
const WIDTH_STEP = 4;

/**
 * The layouts of the trees drawn last, by what they are made of. The page is drawn again for every change of a
 * setting, and most change nothing about how the tree is laid out (the title's words, a colour, a box moved
 * back to where it was): the work already done for the same tree then serves again.
 */
const layouters = new Map<string, Layouter>();
const LAYOUTERS_KEPT = 2;

function layouterFor(index: TreeIndex, options: LayoutOptions, centreId?: string, partnerId?: string): Layouter {
  const made = new Layouter(index, options, centreId, partnerId);
  const key = `${centreId ?? ''} ${partnerId ?? ''}\n${JSON.stringify(options)}\n${made.signature}`;
  const kept = layouters.get(key);
  layouters.delete(key);
  layouters.set(key, kept ?? made);
  if (layouters.size > LAYOUTERS_KEPT) layouters.delete(layouters.keys().next().value!);
  return kept ?? made;
}

/** Lets go of the layouts kept from the pages drawn last (when nobody is looking at a page any more): they take tens of megabytes for a big tree. */
export function forgetLayouts(): void {
  layouters.clear();
}

export function renderPoster(input: PosterInput): PosterResult {
  return finish(posterSteps(input));
}

/** What part of the tree a print with these settings shows, around `centerId` (and `partnerId`): see scopeDocument. */
export function scopeOptions(settings: PrintSettings, centerId: string, partnerId: string | undefined, omit?: ReadonlySet<string>): ScopeOptions {
  return {
    centerId,
    partnerId,
    ancestors: settings.ancestors,
    descendants: settings.descendants,
    branches: settings.branches,
    inLawFamilies: settings.inLawFamilies,
    showHidden: settings.showHidden,
    siblingsOnly: settings.siblingsOnly,
    omit,
    nearFormerPartner: true,
    added: settings.added?.length ? new Set(settings.added) : undefined,
  };
}

/**
 * renderPoster a piece at a time (see Steps): fitting a big tree to its page takes seconds, and done in pieces
 * the window answers meanwhile and the work can be dropped for a page asked for after it.
 */
export function* posterSteps(input: PosterInput): Steps<PosterResult> {
  const settings: PrintSettings = { ...DEFAULT_PRINT, ...(input.settings ?? effectivePrint(input.doc)) };
  const say = (step: ProgressStep, detail?: Record<string, string | number>) => input.report?.(step, detail);
  say('start', { people: input.doc.people.length });
  const language = chartLanguage(input.language ?? input.doc.view.language);
  const now = input.now ?? new Date();
  const fullIndex = new TreeIndex(input.doc);
  const centerId = pickCenter(input.doc, fullIndex, settings);
  const partnerId = centerId ? pickPartner(fullIndex, centerId, settings) : undefined;

  const doc = centerId
    ? scopeDocument(input.doc, fullIndex, scopeOptions(settings, centerId, partnerId, input.omit)).doc
    : { ...input.doc, people: [], families: [] };
  const index = new TreeIndex(doc);
  const measure = (t: string, f: FontSpec) => input.measure(t, cssFont(f)) + (f.letterSpacing ?? 0) * f.size * Math.max(0, Array.from(t).length - 1);
  const fit = (t: string, f: FontSpec, max: number) => fitText(t, f, max, measure);

  // Surnames at birth come from the whole tree: a father may be outside the part that is printed.
  // Everyone's is needed, so that families get the colours they have on the chart.
  const births = new Map(input.doc.people.map((p) => [p.id, birthSurname(fullIndex, p, language.surnameFor)]));
  const surnames = new Map(
    doc.people.map((p) => [p.id, surnameLinesIn(language, p, births.get(p.id), settings.unknownBirthNames && birthSurnameUnknown(fullIndex, p))]),
  );

  // Every card has the same parts, so all are one size: a line for the surname at birth when anyone has one.
  const parts: CardParts = {
    emblem: settings.showEmblems,
    birthName: settings.showBirthNames && [...surnames.values()].some((s) => !!s.birth),
    dates: settings.dates !== 'none',
    emblemTop: settings.emblemAlign === 'top',
    sexAccent: settings.sexColors,
  };
  const design = cardDesign(parts, settings.largeText ? LARGE_TEXT : 1);

  const texts = new Map<string, CardText>();
  // Cards wider than the rest, for names that need it (PrintSettings.freeWidths).
  const widths: Record<string, number> = {};
  for (const p of doc.people) {
    const names = surnames.get(p.id) ?? { surname: p.name.surname.trim(), birth: '' };
    const givenNames = nameUnknown(p) ? language.unknown(p.sex) : p.name.given.trim();
    let wider = 0;
    if (settings.freeWidths) {
      // As wide as the longest of the names needs; the dates never widen a card (they are cut down to years).
      const need = Math.max(
        measure(givenNames, design.given),
        measure(names.surname, design.surname),
        parts.birthName && names.birth ? measure(names.birth, design.birth) : 0,
      );
      if (need > design.textW) {
        wider = Math.min(design.width * (WIDEST_CARD - 1), Math.ceil((need - design.textW) / WIDTH_STEP) * WIDTH_STEP);
        widths[p.id] = design.width + wider;
      }
    }
    // Dates in full where they fit the card; years otherwise.
    const room = design.textW + wider;
    let dates = '';
    if (parts.dates) {
      const years = language.lifespan(p);
      const full = settings.dates === 'full' ? language.lifespan(p, true) : years;
      dates = fit(full, design.dates, room) === full ? full : fit(years, design.dates, room);
    }
    texts.set(p.id, {
      given: fit(givenNames, design.given, design.textW + wider),
      surname: fit(names.surname, design.surname, room),
      birth: parts.birthName ? fit(names.birth, design.birth, room) : '',
      dates,
      initials: initials(p),
    });
  }

  const options: LayoutOptions = {
    ...LAYOUT,
    ...(settings.tight ? TIGHT_LAYOUT : {}),
    cardWidth: design.width,
    cardHeight: design.height,
    widths: Object.keys(widths).length ? widths : undefined,
    stackCouples: settings.stackCouples,
    amidPartners: settings.amidPartners,
    flipped: settings.flipped?.length ? settings.flipped : undefined,
    // The bigger marks between partners need a wider gap: the widest (divorced: two rings struck through) clear of both cards.
    ...(settings.strongLines ? { partnerGap: Math.max((settings.tight ? TIGHT_LAYOUT : LAYOUT).partnerGap ?? LAYOUT.partnerGap, STRONG_PARTNER_GAP) } : {}),
    ...gapsFor(settings, design.width),
    // Room round the couple in the middle for the frame round them.
    halo: { ids: [centerId, partnerId].filter((id): id is string => !!id), pad: COUPLE_PAD + 2 },
  };
  const layouter = layouterFor(index, options, centerId, partnerId);
  const title = settings.title?.trim() || input.doc.meta.title || 'Family tree';
  const defs = new Map<string, string>();
  const ctx: PosterContext = {
    settings,
    language,
    page: { w: 0, h: 0, u: 0, margin: 0 },
    legend: [],
    legendAt: !settings.showLegend ? 'none' : settings.legendBox || settings.legendAnchor ? 'free' : 'below',
    title,
    subtitle: '',
    years: yearRange(doc),
    now,
    measure,
    def: (id, markup) => {
      if (!defs.has(id)) defs.set(id, markup);
    },
  };

  // One colour per family name, as on the chart. The generations do not depend on how the tree is arranged.
  const ranks = layouter.run({ down: Infinity, bands: [Infinity], wingL: Infinity, wingR: Infinity, flankL: 'band', flankR: 'band', stack: false }).ranks;
  const colors = assignColors(doc, 'family', ranks, (p) => births.get(p.id) || p.name.surname.trim(), input.doc);
  ctx.legend = colors.legend.map((l) => ({ ...l, label: l.key === '' ? language.others : l.label }));
  const generations = new Set(ranks.values()).size;
  ctx.subtitle =
    settings.subtitle?.trim() === '' ? '' : (settings.subtitle?.trim() ?? (doc.people.length ? language.summary(generations, doc.people.length) : ''));

  // The title (the page's lettering with it) and the families' names as big as asked for, a line so many
  // centimetres high (see PrintSettings.titleSize, legendSize); otherwise in proportion to the page.
  const letters = (cm: number | undefined) => (cm ? (clamp(cm, LETTERING_CM.min, LETTERING_CM.max) * 10 * PX_PER_MM) / LINE_HEIGHT : undefined);
  const titleLetters = letters(settings.titleSize);
  const legendLetters = letters(settings.legendSize);
  const units = (base: number) => ({ u: titleLetters ? titleLetters / LETTERING.title : base, lu: legendLetters ? legendLetters / LETTERING.legend : base });
  /** The letters the page gives the title and the families' names by itself, on a sheet so big on its shorter side with names so big on the cards (AUTO_LETTERS). */
  const autoLetters = (short: number, names?: number) => {
    const auto = (of: { names: number; min: number; max: number }) =>
      names === undefined ? short * of.max : clamp(names * of.names, short * of.min, short * of.max);
    return { title: auto(AUTO_LETTERS.title), legend: Math.max(auto(AUTO_LETTERS.legend) - LEGEND_TRIM, 1) };
  };
  /** The same on paper, sized to the sheet and to the names on the cards; before the cards' size is known, as big as the sheet allows. */
  const paperUnits = (short: number, names?: number) => {
    const auto = autoLetters(short, names);
    return { u: (titleLetters ?? auto.title) / LETTERING.title, lu: (legendLetters ?? auto.legend) / LETTERING.legend };
  };
  const given = { work: settings.tight ? 2 : 1, fill: settings.fill };
  const paper = paperSize(settings.paper);

  /**
   * What the title is drawn in (it stands in the middle of it) on a page so big: across the top; or where it
   * was put by hand; or held at its anchor, as far to a side as leaves all of it (its rules reach out from the
   * middle) inside the margin. Whatever size the title is, an anchored one stays at its place.
   */
  const titleOn = (w: number, h: number, margin: number, header: PageBlock): Rect => {
    const across = Math.max(10, w - margin * 2);
    const top: Rect = { x: margin, y: margin, w: across, h: header.height };
    if (!paper) return top;
    if (settings.titleAnchor) {
      const to = anchorShares(settings.titleAnchor);
      const reach = Math.min(across, header.extent?.(top).w ?? across) / 2;
      return { ...top, x: margin + reach + to.x * (across - 2 * reach) - across / 2, y: margin + to.y * Math.max(0, h - margin * 2 - header.height) };
    }
    const at = settings.titleAt;
    return at ? { ...top, x: at.x * w - across / 2, y: at.y * h } : top;
  };
  /**
   * The box of the families' names as it was sized by hand (PrintSettings.legendBox): where it was put; or, held
   * at an anchor, a box of that size there, made bigger where the names need more than it has (they then grow
   * away from the anchor, and never off the page or out of the tree's sight).
   */
  const handBox = (by: NonNullable<PrintSettings['legendBox']>, w: number, h: number, chart: Rect, title?: Rect): Rect => {
    const box: Rect = { x: by.x * w, y: by.y * h, w: by.w * w, h: by.h * h };
    if (!settings.legendAnchor) return box;
    const need = namesIn(ctx, box);
    return clearOf(placeAt(ctx, chart, settings.legendAnchor, Math.max(box.w, need.w), Math.max(box.h, need.h)), title);
  };
  /**
   * The families' names placed by the page (held at an anchor, or in a corner it chose) where the title stands
   * too: under it when they are in the upper half of the page, over it in the lower, PrintSettings.legendGap
   * apart. Names placed by hand stay where they were put.
   */
  const clearOf = (rect: Rect, title?: Rect): Rect => {
    if (!title || !paper) return rect;
    const gap = (settings.legendGap ?? LEGEND_GAP_CM) * 10 * PX_PER_MM;
    const across = rect.x < title.x + title.w && title.x < rect.x + rect.w;
    const meet = rect.y < title.y + title.h + gap && title.y < rect.y + rect.h + gap;
    if (!across || !meet) return rect;
    const upper = rect.y + rect.h / 2 < ctx.page.h / 2;
    return { ...rect, y: upper ? title.y + title.h + gap : title.y - gap - rect.h };
  };
  /** The names as a block of so many columns at an anchor, clear of the title. */
  const blockAt = (chart: Rect, at: Anchor, columns: number, title?: Rect): Rect => clearOf(namesBlock(ctx, chart, at, columns), title);

  /** The page in one orientation: the room the title and the families' names leave, and the tree fitted into it. */
  function* lay(
    w: number,
    h: number,
    landscape: boolean,
    nameSize?: number,
    shape?: Fitted['shape'],
    chosen?: NamesPlace,
    fitting: typeof given = given,
  ): Steps<Placed> {
    const margin = MARGIN * Math.min(w, h);
    ctx.page = { w, h, ...paperUnits(Math.min(w, h), nameSize), margin };
    say('orientation', { paper: settings.paper.toUpperCase(), landscape: landscape ? 1 : 0 });
    const header = settings.showTitle ? heritage.header(ctx) : NO_BLOCK;
    let footer = heritage.footer(ctx);
    // The tree has the whole page inside the margin, but for the boxes of the title and of the families' names:
    // it stands clear of those, with room beside them and between them for cards.
    const chart: Rect = { x: margin, y: margin, w: Math.max(10, w - margin * 2), h: Math.max(10, h - margin * 2) };
    const boxes: Rect[] = [];
    let titleBox: Rect | undefined;
    if (settings.showTitle) {
      const rect = titleOn(w, h, margin, header);
      titleBox = header.extent?.(rect) ?? rect;
      boxes.push(titleBox);
    }
    const pad = ctx.page.u * 1.2;
    const blockOf = (b: Rect) => ({ x: b.x - chart.x - pad, y: b.y - chart.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 });
    const titleBlocks = boxes.map(blockOf);
    // The families' names keep a place of their own only where asked (PrintSettings.legendBlocks); otherwise the
    // tree is fitted to the whole page and the names go where no card is (or, where there is no such place, as ever).
    const roomWith = (legend?: Rect, reserve = settings.legendBlocks): Room => ({
      w: chart.w,
      h: chart.h,
      centred: 0,
      maxScale: MAX_SCALE,
      blocks: legend && reserve ? [...titleBlocks, blockOf(legend)] : titleBlocks,
    });
    const effort = input.effort ?? 'full';
    let legend: Rect | undefined;
    let names: NamesPlace | undefined;
    /** The best few trees for the page without the names: for a quick look at how big the tree stays around a box. */
    const looks = function* (): Steps<(rect: Rect) => number> {
      const trees: LayoutResult[] = [];
      for (const tree of yield* fitShapesSteps(layouter, options, roomWith(), { ...given, fill: false }, NAMES_TREES)) {
        trees.push(layouter.run(tree));
        yield;
      }
      return (rect: Rect) => Math.max(0, ...trees.map((tree) => place(tree, roomWith(rect)).scale));
    };
    if (settings.showLegend && !settings.legendBox && (settings.legendAnchor || settings.legendBlocks)) say('names');
    if (settings.showLegend && settings.legendBox) {
      legend = handBox(settings.legendBox, w, h, chart, titleBox);
    } else if (settings.showLegend && settings.legendAnchor) {
      // Held at a place, as a block just big enough for the names: in as many columns as keep the tree biggest
      // around it (a wide block suits the top or the foot, a tall one a side). Decided once for a page.
      const at = settings.legendAnchor;
      names = chosen;
      if (!names) {
        const count = namesEntries(ctx).entries.length;
        const columns = namesColumns(ctx, chart);
        if (!columns.length && count) columns.push(Math.ceil(Math.sqrt(count)));
        let best = columns[0];
        if (columns.length > 1 && effort === 'full') {
          const quick = yield* looks();
          let most = -1;
          for (const c of columns) {
            const size = quick(blockAt(chart, at, c, titleBox));
            if (size > most * 1.002) [most, best] = [size, c];
            yield;
          }
        }
        names = best ? { at, columns: best } : undefined;
      }
      legend = names && names.at !== 'foot' ? blockAt(chart, names.at, names.columns, titleBox) : undefined;
    } else if (settings.showLegend) {
      // Not placed by hand: in rows across the foot as ever, unless a corner the tree leaves empty suits the page
      // better. Decided once for a page (by how big the tree as it would stand without them can stay around
      // each place), and kept while the lettering is sized to the cards.
      ctx.legendAt = 'below';
      footer = heritage.footer(ctx);
      const foot = footer.legend?.({ x: margin, y: h - margin - footer.height, w: chart.w, h: footer.height });
      const cornered = (at: Anchor, columns: number) => blockAt(chart, at, columns, titleBox);
      names = chosen ?? (foot ? { at: 'foot' } : undefined);
      if (!chosen && foot && effort === 'full' && settings.legendBlocks) {
        // How big the tree stays around each place, at a quick look: the best few trees found for the page
        // without the names, each set down around the box as it is (the tree is not the same tree around every
        // place). The corners that look better than the foot are then fitted in full, and so is the foot.
        const quick = yield* looks();
        const atFoot = quick(foot);
        const corners: { names: NamesPlace & { at: Corner }; rect: Rect; quick: number }[] = [];
        for (const at of CORNERS)
          for (const columns of namesColumns(ctx, chart)) {
            const rect = cornered(at, columns);
            const c = { names: { at, columns }, rect, quick: quick(rect) };
            if (c.quick > atFoot * NAMES_GAIN) corners.push(c);
            yield;
          }
        corners.sort((a, b) => b.quick - a.quick);
        if (corners.length) {
          const full = function* (rect: Rect): Steps<number> {
            return (yield* fitLayoutSteps(layouter, options, roomWith(rect), effort, { ...given, fill: false })).scale;
          };
          let best: { names: NamesPlace; scale: number } = { names: { at: 'foot' }, scale: (yield* full(foot)) * NAMES_GAIN };
          // The best block of each corner, the most promising corners first.
          const tried = new Set<Anchor>();
          for (const c of corners) {
            if (tried.has(c.names.at) || tried.size >= NAMES_TRIED) continue;
            tried.add(c.names.at);
            const scale = yield* full(c.rect);
            if (scale > best.scale * 1.002) best = { names: c.names, scale };
          }
          names = best.names;
        }
      }
      legend = names && names.at !== 'foot' ? cornered(names.at, names.columns) : foot;
      if (names && names.at !== 'foot') {
        ctx.legendAt = 'free';
        footer = heritage.footer(ctx);
      }
    }
    const room = roomWith(legend);
    let fitted = shape ? { ...place(layouter.run(shape), room), shape } : yield* fitLayoutSteps(layouter, options, room, effort, fitting);
    if (!settings.legendBlocks && settings.showLegend && !settings.legendBox && !settings.legendAnchor && legend) {
      // Names that stand on no card stay; otherwise the first place in a corner (or at the foot) that is free,
      // and where there is none the room is kept for them, as it is where they are asked to block.
      const air = ctx.page.u * 0.6;
      const cards = fitted.layout.cards.map((c) => ({
        x: chart.x + fitted.x + c.x * fitted.scale,
        y: chart.y + fitted.y + c.y * fitted.scale,
        w: c.w * fitted.scale,
        h: c.h * fitted.scale,
      }));
      const hit = (r: Rect) => cards.some((c) => c.x < r.x + r.w + air && r.x < c.x + c.w + air && c.y < r.y + r.h + air && r.y < c.y + c.h + air);
      if (hit(legend)) {
        let free: { names: NamesPlace; rect: Rect } | undefined;
        search: for (const at of CORNERS)
          for (const columns of namesColumns(ctx, chart)) {
            const rect = blockAt(chart, at, columns, titleBox);
            if (!hit(rect)) {
              free = { names: { at, columns }, rect };
              break search;
            }
          }
        if (free) {
          names = free.names;
          ctx.legendAt = 'free';
          footer = heritage.footer(ctx);
        } else {
          fitted = shape
            ? { ...place(layouter.run(shape), roomWith(legend, true)), shape }
            : yield* fitLayoutSteps(layouter, options, roomWith(legend, true), effort, fitting);
        }
      }
    }
    return { fitted, landscape, page: { ...ctx.page }, chart, header, footer, names, room };
  }
  /**
   * The title, the families' names and the rest of the page's lettering in proportion to the names on the cards,
   * not only to the paper: the tree is fitted with the lettering as big as the sheet allows, and the lettering
   * then sized to the cards that gives (which leaves the tree a little more room, and the cards a little bigger).
   * With the lettering at its size the tree is fitted once more, in case another shape suits the room better
   * now than the one found around the bigger lettering (without the longer search: that one is not run twice).
   */
  function* layFor(w: number, h: number, landscape: boolean): Steps<Placed> {
    let placed = yield* lay(w, h, landscape);
    for (let round = 0; round < 2; round++) {
      const names = design.given.size * placed.fitted.scale;
      say('lettering', { round: round + 1 });
      const next = paperUnits(Math.min(w, h), names);
      if (Math.abs(next.u - placed.page.u) < placed.page.u * 0.02 && Math.abs(next.lu - (placed.page.lu ?? next.lu)) < next.lu * 0.02) break;
      const kept: Placed = yield* lay(w, h, landscape, names, placed.fitted.shape, placed.names);
      const again: Placed = (input.effort ?? 'full') === 'full' ? yield* lay(w, h, landscape, names, undefined, placed.names, { ...given, fill: false }) : kept;
      placed = again.fitted.scale > kept.fitted.scale * 1.002 ? again : kept;
    }
    return placed;
  }

  let placed: Placed;
  let layoutRatios = [1];
  let layoutChoice = 0;
  if (paper) {
    const portrait = { w: paper.widthMm * PX_PER_MM, h: paper.heightMm * PX_PER_MM };
    const tries = settings.orientation === 'portrait' ? [false] : settings.orientation === 'landscape' ? [true] : [true, false];
    const all: Placed[] = [];
    for (const land of tries) all.push(yield* layFor(land ? portrait.h : portrait.w, land ? portrait.w : portrait.h, land));
    placed = all.reduce((best, p) => (p.fitted.scale > best.fitted.scale * 1.02 ? p : best));
    // Other arrangements of the tree that come out about as well: one of them may suit better (PrintSettings.layoutChoice).
    if (placed.room && (input.effort ?? 'full') === 'full' && input.alternatives !== false) {
      say('alternatives');
      const best = placed.fitted;
      const alts: Fitted[] = [best];
      for (const shape of yield* fitShapesSteps(layouter, options, placed.room, given, LAYOUTS_LOOKED)) {
        const f: Fitted = { ...place(layouter.run(shape), placed.room), shape };
        if (f.scale >= best.scale * LAYOUT_SPREAD && !alts.some((a) => Math.abs(a.scale - f.scale) < best.scale * 0.004)) alts.push(f);
        yield;
      }
      const rest = alts
        .slice(1)
        .sort((a, b) => b.scale - a.scale)
        .slice(0, LAYOUTS_OFFERED - 1);
      const list = [best, ...rest];
      layoutRatios = list.map((a) => a.scale / best.scale);
      layoutChoice = Math.min(settings.layoutChoice ?? 0, list.length - 1);
      placed = { ...placed, fitted: list[layoutChoice] };
    }
  } else {
    // A page the size of the tree: the tree as it suits a screen, then the page around it.
    const fitted = yield* fitLayoutSteps(layouter, options, { ...FIT_ROOM, centred: 0 }, input.effort ?? 'full', given);
    const b = fitted.layout.bounds;
    const content = { w: Math.max(b.w, 1), h: Math.max(b.h, 1) };
    const base = clamp(Math.max(content.w, content.h) / 110, 8, 22);
    const margin = MARGIN * 100 * base;
    ctx.page = { w: content.w + margin * 2, h: 0, ...units(base), margin };
    const header = settings.showTitle ? heritage.header(ctx) : NO_BLOCK;
    const footer = heritage.footer(ctx);
    ctx.page.h = content.h + margin * 2 + header.height + footer.height;
    const chart = { x: margin, y: margin + header.height, w: content.w, h: content.h };
    placed = { fitted: { ...fitted, scale: 1, x: -b.x, y: -b.y, off: { x: 0, y: 0 } }, landscape: false, page: { ...ctx.page }, chart, header, footer };
  }

  ctx.page = placed.page;
  // The families' names in a corner are drawn as a block, like a box placed by hand; the foot of the page then has no rows of them.
  const cornerNames = placed.names && placed.names.at !== 'foot' ? placed.names : undefined;
  if (settings.showLegend && !settings.legendBox) ctx.legendAt = cornerNames ? 'free' : 'below';
  const { fitted, chart, header, footer } = placed;
  // Cards moved by hand go where they were put, their lines after them.
  say('draw', { cards: fitted.layout.cards.length });
  const moved = settings.moves ? applyMoves(fitted.layout, new Map(Object.entries(settings.moves)), lineClearance(options)) : fitted.layout;
  // Lines led by hand keep their bends; their ends stay with the marker and the card.
  const layout = settings.lineBends ? applyBends(moved, new Map(Object.entries(settings.lineBends))) : moved;
  const s = fitted.scale;
  const W = ctx.page.w;
  const H = ctx.page.h;
  const margin = ctx.page.margin;

  const titleFree = settings.showTitle && !!paper && (!!settings.titleAt || !!settings.titleAnchor);
  const headerRect = settings.showTitle ? titleOn(W, H, margin, header) : { x: margin, y: margin, w: W - margin * 2, h: header.height };
  const titleRect = settings.showTitle ? (header.extent?.(headerRect) ?? headerRect) : undefined;
  const footerRect = { x: margin, y: H - margin - footer.height, w: W - margin * 2, h: footer.height };
  // The box with the families' names: placed by hand, or where the page put them (for the preview to offer moving it).
  const box = settings.showLegend ? settings.legendBox : undefined;
  const legendRect: Rect | undefined = box
    ? handBox(box, W, H, chart, titleRect)
    : cornerNames
      ? blockAt(chart, cornerNames.at, cornerNames.columns, titleRect)
      : footer.legend?.(footerRect);

  const focusIds = new Set([centerId, partnerId].filter((id): id is string => !!id));
  // Lines and the marks between partners stronger, where asked (PrintSettings.strongLines).
  const weight = settings.strongLines ? STRONG_LINES : 1;
  const markScale = settings.strongLines ? STRONG_MARKS : 1;
  const draw: Drawing = {
    design,
    parts,
    settings,
    texts,
    colors: colors.byPerson,
    index,
    focusIds,
  };
  let chartSvg = '';
  // The couple the page is drawn around: one frame round the two of them (and the marker between them), a
  // double rule in the page's colour on a faint ground. Each their own where they stand apart.
  const held = layout.cards.filter((c) => focusIds.has(c.personId) && !c.ghost);
  const apart = (a: LayoutCard, b: LayoutCard) => ({
    x: Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)),
    y: Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h)),
  });
  const together = held.length === 2 && apart(held[0], held[1]).x <= options.partnerGap + 2 && apart(held[0], held[1]).y <= options.stackGap + 2;
  const frames = (together ? [held] : held.map((c) => [c])).map((cs) => {
    const x0 = Math.min(...cs.map((c) => c.x));
    const y0 = Math.min(...cs.map((c) => c.y));
    return { x: x0, y: y0, w: Math.max(...cs.map((c) => c.x + c.w)) - x0, h: Math.max(...cs.map((c) => c.y + c.h)) - y0 };
  });
  // The lines from their parents run through the frame onto their cards; the crown stands clear of where one comes in.
  const into = (f: Rect) => {
    const box = frameBox(f);
    return layout.lines
      .map((l) => l.points[l.points.length - 1])
      .filter((p) => p && p.x > box.x && p.x < box.x + box.w && Math.abs(p.y - f.y) < 0.5)
      .map((p) => p.x);
  };
  for (const f of frames) chartSvg += coupleFrame(f, into(f));
  for (const u of layout.unions) chartSvg += el('path', { d: roundedPath(u.line, 6), fill: 'none', stroke: palette.line, 'stroke-width': 1.1 * weight });
  // The direct line of each of the two the page is drawn around, in their own colour (the cards': blue, red):
  // from them up through their parents. Only that: brothers, sisters and their families stay plain.
  const lineage = (id?: string): Set<string> => {
    const seen = new Set<string>();
    const walk = (p: string) => {
      if (seen.has(p)) return;
      seen.add(p);
      for (const f of index.parentFamilies(p)) for (const parent of f.partners) walk(parent);
    };
    if (id) walk(id);
    return seen;
  };
  const colourOf = (id?: string) => {
    const sex = id ? accentOf(index.person(id)?.sex ?? 'unknown') : 'other';
    return sex === 'male' ? palette.male : sex === 'female' ? palette.female : palette.trunk;
  };
  const lines = [
    { of: lineage(centerId), colour: colourOf(centerId) },
    { of: lineage(partnerId), colour: colourOf(partnerId) },
  ];
  // Whoever is in a direct line is the child of people in it too, known or not (a line up to parents nobody knows).
  const direct = (l: { childId: string; trunk: boolean }) => lines.find((x) => x.of.has(l.childId))?.colour ?? (l.trunk ? palette.trunk : undefined);
  // Every stretch is drawn once, by the first line that runs along it: the direct lines first, so what they share with others is theirs.
  const ordered = [...layout.lines].sort(
    (a, b) => Number(!!direct(b)) - Number(!!direct(a)) || Number(a.relation !== 'biological') - Number(b.relation !== 'biological'),
  );
  const paths = sharedPaths(ordered, 7);
  // The plain lines under the coloured ones: where a branch starts on a direct line, its first step lies under that line.
  const strokes = { plain: '', direct: '' };
  for (const [i, l] of ordered.entries()) {
    if (!paths[i]) continue;
    const colour = direct(l);
    strokes[colour ? 'direct' : 'plain'] += el('path', {
      d: paths[i],
      fill: 'none',
      stroke: colour ?? palette.line,
      'stroke-width': (colour ? 2.3 : 1.1) * weight,
      'stroke-linecap': 'round',
      'stroke-dasharray': RELATION_DASH[l.relation],
      // A click on a line in the print studio takes away what hangs on it.
      'data-family': l.familyId,
      'data-child': l.childId,
    });
  }
  chartSvg += strokes.plain + strokes.direct;
  for (const u of layout.unions) {
    const fam = index.family(u.familyId);
    const mark = unionMark(u.kind, fam ? relationshipStatus(fam) : 'unknown', 4.8 * markScale);
    chartSvg += drawMark(mark, u.x, u.y, {
      plate: palette.paper,
      ring: GOLD,
      ringApart: palette.faint,
      ringWidth: 1.45 * weight,
      dot: palette.line,
      cut: palette.break,
    });
  }
  // How each couple stands, in a word: under the marker of a couple side by side, between the cards of one that
  // stands one over the other, beside a marker that sits on a line over other cards.
  const unionWords: string[] = [];
  if (settings.unionText) {
    const font = (size: number): FontSpec => ({ family: SERIF, size, style: 'italic' });
    for (const u of layout.unions) {
      const fam = index.family(u.familyId);
      const word = fam ? language.union(relationshipStatus(fam)) : '';
      if (!word) continue;
      unionWords.push(word);
      const level = u.line.length === 2;
      const upright = !level && u.line.length === 4 && Math.abs(u.line[1].x - u.line[2].x) < 0.01;
      const cardsLeft = upright && u.line[0].x < u.x;
      // Between two cards one over the other there is only so much room.
      const size = upright ? Math.min(8.5, options.stackGap - 1.5) : 8.5;
      const at = level
        ? { x: u.x, y: u.y + options.cardHeight / 2 + size * 0.9, anchor: 'middle' }
        : upright
          ? { x: u.x + (cardsLeft ? -9 : 9), y: u.y + size * 0.32, anchor: cardsLeft ? 'end' : 'start' }
          : { x: u.x + 9, y: u.y + size * 0.32, anchor: 'start' };
      chartSvg += el(
        'text',
        {
          x: at.x,
          y: at.y,
          'text-anchor': at.anchor,
          ...fontAttrs(font(size)),
          fill: palette.muted,
          stroke: palette.paper,
          'stroke-width': 2.4,
          'paint-order': 'stroke',
          'stroke-linejoin': 'round',
        },
        text(word),
      );
    }
  }
  for (const h of layout.placeholders) {
    chartSvg +=
      el('rect', {
        x: h.x,
        y: h.y,
        width: h.w,
        height: h.h,
        rx: design.radius,
        fill: palette.card,
        'fill-opacity': 0.55,
        stroke: palette.cardEdge,
        'stroke-width': 0.9,
        'stroke-dasharray': UNKNOWN_DASH,
      }) +
      el('text', { x: h.x + h.w / 2, y: h.y + h.h / 2 + 7, 'text-anchor': 'middle', ...fontAttrs({ ...design.given, size: 22 }), fill: palette.faint }, '?');
  }
  for (const c of layout.cards) chartSvg += drawCard(draw, c);

  // The title and the families' names each in a group of their own: the print studio moves them with their boxes.
  const group = (name: string, markup: string) => (markup ? `<g class="${name}">${markup}</g>` : '');
  const body = [
    heritage.background(ctx, settings.showFrame),
    group('pp-title', header.draw(headerRect)),
    `<g transform="translate(${n(chart.x + fitted.x)},${n(chart.y + fitted.y)}) scale(${n(s)})">${chartSvg}</g>`,
    group('pp-legend', footer.draw(footerRect)),
    (box || cornerNames) && legendRect
      ? drawLegendBox(ctx, legendRect, cornerNames ? { letters: namesSize(ctx), columns: cornerNames.columns } : undefined)
      : '',
    settings.showFrame ? heritage.overlay(ctx) : '',
  ].join('');

  const sizeAttrs = paper ? `width="${n(W / PX_PER_MM)}mm" height="${n(H / PX_PER_MM)}mm"` : `width="${Math.ceil(W)}" height="${Math.ceil(H)}"`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ${sizeAttrs} viewBox="0 0 ${n(W)} ${n(H)}">` +
    (defs.size ? `<defs>${[...defs.values()].join('')}</defs>` : '') +
    body +
    `</svg>`;

  // What the page would make the title and the names by itself, with the cards as they came out.
  const suggested = paper ? autoLetters(Math.min(W, H), design.given.size * s) : undefined;
  const lineCm = (letters: number) => (letters * LINE_HEIGHT) / (10 * PX_PER_MM);
  const allText = [
    title,
    ctx.subtitle,
    language.drawn(now),
    ...unionWords,
    ...[...texts.values()].flatMap((t) => [t.given, t.surname, t.birth, t.dates, t.initials]),
    ...ctx.legend.map((l) => l.label),
    'IVXLCDM0123456789–·,. ?',
  ].join('');

  return {
    svg,
    width: W,
    height: H,
    paper: paper ? { widthMm: W / PX_PER_MM, heightMm: H / PX_PER_MM, landscape: placed.landscape } : undefined,
    namePt: design.given.size * s * 0.75,
    cardMm: { w: (design.width * s) / PX_PER_MM, h: (design.height * s) / PX_PER_MM },
    lettering: {
      titleCm: lineCm(ctx.page.u * LETTERING.title),
      legendCm: lineCm((ctx.page.lu ?? ctx.page.u) * LETTERING.legend),
      autoTitleCm: lineCm(suggested?.title ?? ctx.page.u * LETTERING.title),
      autoLegendCm: lineCm(suggested?.legend ?? (ctx.page.lu ?? ctx.page.u) * LETTERING.legend),
    },
    layouts: layoutRatios.map((ratio) => ({ ratio })),
    layoutChoice,
    coverage: (layout.cards.length * design.width * design.height * s * s) / Math.max(1, chart.w * chart.h),
    people: doc.people.length,
    total: input.doc.people.length,
    generations,
    centerId,
    partnerId,
    text: allText,
    legend: legendRect && {
      x: legendRect.x / W,
      y: legendRect.y / H,
      w: legendRect.w / W,
      h: legendRect.h / H,
      free: !!box || (settings.showLegend && !!settings.legendAnchor),
    },
    title: titleRect && paper ? { x: titleRect.x / W, y: titleRect.y / H, w: titleRect.w / W, h: titleRect.h / H, free: titleFree } : undefined,
    inner: { x: margin / W, y: margin / H, w: 1 - (2 * margin) / W, h: 1 - (2 * margin) / H },
    shown: doc.people.map((p) => p.id),
    cardUnits: { w: design.width, h: design.height },
    gaps: { partner: options.partnerGap, sibling: options.siblingGap, family: options.familyGap, stack: options.stackGap },
    lines: layout.lines.map((l) => ({ key: l.key, familyId: l.familyId, childId: l.childId, points: l.points.map((p) => ({ x: p.x, y: p.y })) })),
    namesIn: (at, style = {}) =>
      namesMarkup(ctx, { x: at.x * W, y: at.y * H, w: at.w * W, h: at.h * H }, undefined, {
        align: style.align,
        letters: letters(style.cm),
      }),
  };
}

interface Drawing {
  design: CardDesign;
  parts: CardParts;
  settings: PrintSettings;
  texts: ReadonlyMap<string, CardText>;
  colors: ReadonlyMap<string, Tincture>;
  index: TreeIndex;
  focusIds: ReadonlySet<string>;
}

/** One card (see card-design.ts for what is on it). */
function drawCard(c: Drawing, at: LayoutCard): string {
  const person = c.index.person(at.personId);
  const t = c.texts.get(at.personId);
  if (!person || !t) return '';
  const d = c.design;
  const w = at.w;
  const h = at.h;
  const r = d.radius;
  const ghost = !!at.ghost;
  const unknown = nameUnknown(person);
  const sex = accentOf(person.sex);
  const tint = c.parts.sexAccent && sex === 'male' ? palette.cardMale : c.parts.sexAccent && sex === 'female' ? palette.cardFemale : palette.card;

  // (The two the page is drawn around have a frame round both of them, drawn under the lines: see renderPoster.)
  let out = el('rect', {
    width: w,
    height: h,
    rx: r,
    fill: tint,
    stroke: palette.cardEdge,
    'stroke-width': 0.9,
    'stroke-dasharray': ghost ? GHOST_DASH : unknown ? UNKNOWN_DASH : undefined,
  });
  // The plate's engraved inner rule; someone whose name nobody knows has only the dashed edge.
  if (!unknown && !ghost)
    out += el('rect', {
      x: 2.6,
      y: 2.6,
      width: w - 5.2,
      height: h - 5.2,
      rx: Math.max(1, r - 2),
      fill: 'none',
      stroke: palette.cardEdge,
      'stroke-width': 0.4,
      opacity: 0.85,
    });
  if (d.accent && sex) {
    const a = d.accent;
    out += el('path', { d: `M${n(r)},0H${n(a)}V${n(h)}H${n(r)}Q0,${n(h)} 0,${n(h - r)}V${n(r)}Q0,0 ${n(r)},0Z`, fill: palette[sex] });
  }
  if (d.shield) {
    const tin = tinctures[c.colors.get(person.id) ?? 'argent'];
    out +=
      `<g transform="translate(${n(d.shield.x)},${n(d.shield.y)})">` +
      el('path', {
        d: d.shield.path,
        fill: tin.fill,
        stroke: tin.edge ?? palette.ink,
        'stroke-width': tin.edge ? 0.7 : 0.35,
        'stroke-opacity': tin.edge ? 1 : 0.5,
      }) +
      el(
        'text',
        { x: d.shield.w / 2, y: d.shield.h * 0.46 + d.shield.font.size * 0.34, 'text-anchor': 'middle', ...fontAttrs(d.shield.font), fill: tin.ink },
        text(t.initials),
      ) +
      `</g>`;
  }
  const y = cardLines(d, c.parts, { birth: !!t.birth });
  const line = (s: string, f: FontSpec, baseline: number, fill: string) => (s ? el('text', { x: d.textX, y: baseline, ...fontAttrs(f), fill }, text(s)) : '');
  out += line(t.given, { ...d.given, style: unknown ? 'italic' : undefined }, y.given, unknown ? palette.muted : palette.ink);
  out += line(t.surname, d.surname, y.surname, palette.ink);
  out += line(t.birth, d.birth, y.birth, palette.muted);
  out += line(t.dates, d.dates, y.dates, palette.muted);
  // A black ribbon across the top right corner for someone who has died; a white one for a child who died at birth.
  if (c.settings.showRibbons && person.death) out += ribbon(d, w, diedAtBirth(person));
  return el('g', { class: 'card', 'data-person': at.personId, transform: `translate(${n(at.x)},${n(at.y)})`, opacity: ghost ? 0.62 : undefined }, out);
}

/**
 * The frame round the couple the page is drawn around (`f`, their cards together): quiet, in gold, a fine
 * double line close round them on a soft gold ground, with a small crown on it over the middle. The lines from
 * their parents run through it onto the cards: where one comes in at the middle (`lines`, where they come in
 * across), the crown stands aside of it.
 */
function coupleFrame(f: Rect, lines: readonly number[] = []): string {
  const box = frameBox(f);
  const inner = 2.6;
  const middle = box.x + box.w / 2;
  const clear = (x: number) => lines.every((l) => Math.abs(l - x) > CROWN_CLEAR);
  const cx = [0, 1, -1, 2, -2].map((k) => middle + k * CROWN_STEP).find(clear) ?? middle;
  const crown = `M${n(cx - 7)},${n(box.y + 2.2)}L${n(cx - 7)},${n(box.y - 3.6)}L${n(cx - 3.4)},${n(box.y - 0.6)}L${n(cx)},${n(box.y - 5.4)}L${n(cx + 3.4)},${n(box.y - 0.6)}L${n(cx + 7)},${n(box.y - 3.6)}L${n(cx + 7)},${n(box.y + 2.2)}Z`;
  return (
    // A soft ground of gold inside, so the two stand out from the page.
    el('rect', {
      class: 'focus-frame',
      x: box.x,
      y: box.y,
      width: box.w,
      height: box.h,
      rx: 2.5,
      fill: GOLD,
      'fill-opacity': 0.16,
      stroke: GOLD,
      'stroke-width': 1.1,
    }) +
    el('rect', {
      x: box.x + inner,
      y: box.y + inner,
      width: box.w - inner * 2,
      height: box.h - inner * 2,
      rx: 1.5,
      fill: 'none',
      stroke: GOLD,
      'stroke-width': 0.55,
    }) +
    el('rect', { x: cx - 9, y: box.y - 6.5, width: 18, height: 9.5, fill: palette.paper }) +
    el('path', { d: crown, fill: GOLD, 'stroke-linejoin': 'round' }) +
    el('circle', { cx, cy: box.y - 6.6, r: 1.2, fill: GOLD })
  );
}

/** The frame's outline round the couple's cards. */
function frameBox(f: Rect): Rect {
  const p = COUPLE_PAD;
  return { x: f.x - p, y: f.y - p, w: f.w + p * 2, h: f.h + p * 2 };
}

/**
 * The band across the top right corner (a card `w` wide) of someone who has died, in the manner of the title: a dark band (a white one for a
 * child who died at birth) edged inside with a double hairline in gold, and a small lozenge in the middle of it.
 */
function ribbon(d: CardDesign, w: number, atBirth: boolean): string {
  const { from, to } = d.ribbonBand;
  const band = atBirth ? '#fffdf6' : '#231a12';
  const fine = atBirth ? palette.accent : GOLD;
  const rule = (k: number) => `M0,${n(k)}L${n(k)},0`;
  const inset = (to - from) * 0.17;
  // The lozenge in the middle of the band, long along it and narrow across, between the hairlines.
  const c = (from + to) / 4;
  const along = ((to - from) * 0.55) / Math.SQRT2;
  const across = ((to - from) * 0.17) / Math.SQRT2;
  return (
    el('path', {
      d: ribbonPath(d, w),
      fill: band,
      stroke: atBirth ? palette.accent : 'none',
      'stroke-width': atBirth ? 0.6 : undefined,
      'stroke-linejoin': 'round',
    }) +
    // The hairlines and the lozenge worked out as for the top left corner, and turned over onto the right.
    `<g transform="translate(${n(w)},0) scale(-1,1)">` +
    el('path', { d: rule(from + inset) + rule(to - inset), fill: 'none', stroke: fine, 'stroke-width': 0.45, 'stroke-linecap': 'round' }) +
    el('path', {
      d: `M${n(c - along)},${n(c + along)}L${n(c + across)},${n(c + across)}L${n(c + along)},${n(c - along)}L${n(c - across)},${n(c - across)}Z`,
      fill: fine,
    }) +
    `</g>`
  );
}

/** The families' names fitted into a box: as many columns as make the names biggest, the whole lot centred in it. */
/** The families' names as a block: rows so many times their letters apart, columns so many letters apart. */
const NAMES_ROW = 1.9;
const NAMES_COLUMN_GAP = 1.6;
/** The heading over the names (PrintSettings.legendHeading), in the names' letters: the word and the rule under it. */
const NAMES_HEAD = 2.8;
const namesHead = (ctx: PosterContext) => (ctx.settings.legendHeading ? NAMES_HEAD : 0);

/** The size of the letters of the families' names where the page sizes them. */
function namesSize(ctx: PosterContext): number {
  return (ctx.page.lu ?? ctx.page.u) * LETTERING.legend;
}

/** The families whose names are shown, and how wide each entry is with letters 1 unit big: mark, space, label. */
function namesEntries(ctx: PosterContext): { entries: LegendEntry[]; widths: number[] } {
  const entries: LegendEntry[] = ctx.legend.filter((l) => l.key !== '' || ctx.legend.length > 1);
  const style = heritage.legendStyle;
  const REF = 100;
  return { entries, widths: entries.map((l) => style.markW + style.markGap + ctx.measure(l.label, { ...style.font, size: REF }) / REF) };
}

/** The names in so many columns, filled downwards: how wide each column is, and the whole block, with letters 1 unit big. */
function namesColumnsOf(widths: readonly number[], columns: number): { colW: number[]; rows: number; w: number; h: number } {
  const rows = Math.ceil(widths.length / columns);
  const colW = Array.from({ length: columns }, (_, c) => Math.max(0, ...widths.slice(c * rows, (c + 1) * rows)));
  return { colW, rows, w: colW.reduce((a, b) => a + b, 0) + NAMES_COLUMN_GAP * (colW.length - 1), h: rows * NAMES_ROW };
}

/** The numbers of columns a block of the names in a corner may have: those that leave it no bigger than a share of the page, each number of rows once. */
function namesColumns(ctx: PosterContext, chart: Rect): number[] {
  const { widths } = namesEntries(ctx);
  const size = namesSize(ctx);
  const out: number[] = [];
  let rows = Infinity;
  for (let columns = 1; columns <= widths.length; columns++) {
    const block = namesColumnsOf(widths, columns);
    if (block.rows === rows) continue;
    rows = block.rows;
    if (block.w * size <= chart.w * NAMES_BLOCK.w && (block.h + namesHead(ctx)) * size <= chart.h * NAMES_BLOCK.h) out.push(columns);
  }
  return out;
}

/**
 * A box so big at an anchor of the page inside its margin (`chart`): in a corner, in the middle of a side, in the
 * middle. In a corner it keeps clear of the frame's flourish there, where the page has a frame.
 */
function placeAt(ctx: PosterContext, chart: Rect, at: Anchor, w: number, h: number): Rect {
  const to = anchorShares(at);
  const clear = ctx.settings.showFrame && to.x !== 0.5 && to.y !== 0.5 ? heritage.cornerClear(ctx) : 0;
  return { x: chart.x + clear + to.x * (chart.w - clear * 2 - w), y: chart.y + clear + to.y * (chart.h - clear * 2 - h), w, h };
}

/** The box of the names as a block of so many columns at an anchor of the page (a corner, mostly), inside its margin. */
function namesBlock(ctx: PosterContext, chart: Rect, at: Anchor, columns: number): Rect {
  const { widths } = namesEntries(ctx);
  const size = namesSize(ctx);
  const block = namesColumnsOf(widths, Math.max(1, Math.min(columns, widths.length || 1)));
  return placeAt(ctx, chart, at, block.w * size, (block.h + namesHead(ctx)) * size);
}

/** How the families' names stand in a box: how big their letters are, in how many columns, and the room they take. */
interface NamesFit {
  entries: LegendEntry[];
  size: number;
  columns: number;
  /** The width of each column, with letters 1 unit big. */
  colW: number[];
  rows: number;
  /** The height of the heading over the names, in their letters (0 without one). */
  head: number;
  w: number;
  h: number;
}

/**
 * The families' names fitted to a box: placed by hand, or by the page as a block (`block` then says how big
 * their letters are and how many columns they stand in). Their letters keep their size whatever the box is
 * (as asked for, PrintSettings.legendSize, or as the page sizes them); the box only says how they are laid
 * out: in the fewest columns that let all of them stand within its height, as long as its width allows; in as
 * many as its width allows, running past its foot, when they are too many for that.
 */
function namesIn(ctx: PosterContext, box: { w: number; h: number }, block?: { letters: number; columns: number }, letters?: number): NamesFit {
  const { entries, widths } = namesEntries(ctx);
  const head = namesHead(ctx);
  const size = block?.letters ?? letters ?? namesSize(ctx);
  let columns = 1;
  if (block) columns = Math.max(1, Math.min(block.columns, entries.length));
  else {
    for (let c = 1; c <= entries.length; c++) {
      const grid = namesColumnsOf(widths, c);
      if (c > 1 && grid.w * size > box.w + 0.5) break;
      columns = c;
      if ((grid.h + head) * size <= box.h + 0.5) break;
    }
  }
  const grid = namesColumnsOf(widths, columns);
  return { entries, size, columns, colW: grid.colW, rows: grid.rows, head, w: grid.w * size, h: (grid.h + head) * size };
}

/**
 * The families' names drawn in a box. In one bigger than they need they stand where PrintSettings.legendAlign
 * says: in a corner of it, along a side, in the middle. Where they need more than the box has, they start at
 * its left and its top, or run out of it to the left and upwards when they stand at its right or its foot.
 */
function drawLegendBox(ctx: PosterContext, box: Rect, block?: { letters: number; columns: number }): string {
  const out = namesMarkup(ctx, box, block);
  return out ? `<g class="pp-legend">${out}</g>` : '';
}

/**
 * The names as drawLegendBox draws them, without the group around them. `as` asks for them otherwise than
 * the print settings say: standing elsewhere in the box, or with letters so big.
 */
function namesMarkup(ctx: PosterContext, box: Rect, block?: { letters: number; columns: number }, as: { align?: Anchor; letters?: number } = {}): string {
  const fit = namesIn(ctx, box, block, as.letters);
  if (!fit.entries.length) return '';
  const style = heritage.legendStyle;
  const { entries, size, rows } = fit;
  const font = { ...style.font, size };
  const float = anchorShares(block ? 'center' : (as.align ?? ctx.settings.legendAlign ?? 'center'));
  const from = (start: number, room: number, share: number) => start + (share === 1 ? room : Math.max(0, share * room));
  let out = '';
  const left = from(box.x, box.w - fit.w, float.x);
  let x = left;
  const top0 = from(box.y, box.h - fit.h, float.y);
  const top = top0 + fit.head * size;
  // The heading over the names: its rule in their middle, its word where it is aligned along the rule.
  if (fit.head) {
    // Over the names, and as wide as asked within their box (never past its sides).
    const from = Math.min(box.x, left);
    out += namesHeading(ctx, { x: left, w: fit.w }, { x: from, w: Math.max(box.x + box.w, left + fit.w) - from }, top0, size);
  }
  fit.colW.forEach((w, c) => {
    entries.slice(c * rows, (c + 1) * rows).forEach((l, r) => {
      const y = top + (r + 0.5) * NAMES_ROW * size;
      out += style.mark(l, x, y, size);
      out += el('text', { x: x + (style.markW + style.markGap) * size, y: y + size * 0.34, ...fontAttrs(font), fill: style.ink }, text(l.label));
    });
    x += (w + NAMES_COLUMN_GAP) * size;
  });
  return out;
}

/**
 * "Families" over the names, in small capitals, over a rule with a lozenge under the word and a dot at each end,
 * like the rules beside the page's title. The rule is as wide as asked (PrintSettings.legendHeadWidth; as the
 * word needs when not set, never wider than their box). Rule, word and lozenge are aligned alike
 * (PrintSettings.legendHeadAlign): at the box's left, over the middle of the names, or at the box's right.
 */
function namesHeading(ctx: PosterContext, names: { x: number; w: number }, box: { x: number; w: number }, y: number, size: number): string {
  const font: FontSpec = { ...heritage.legendStyle.font, size: size * 1.2, weight: 600, letterSpacing: 0.14 };
  const gap = size * 0.9;
  const dot = size * 0.16;
  const word = ctx.measure(ctx.language.families, font);
  const set = ctx.settings.legendHeadWidth ? ctx.settings.legendHeadWidth * 10 * PX_PER_MM : 0;
  const hw = Math.min(box.w, Math.max(set || Math.max(word, gap * 4) + size * 1.2, word + size * 0.6));
  const align = ctx.settings.legendHeadAlign;
  // The rule at the left, in the middle or at the right of the box, as the word is aligned on it.
  const left = align === 'left' ? box.x : align === 'right' ? box.x + box.w - hw : Math.min(Math.max(names.x + (names.w - hw) / 2, box.x), box.x + box.w - hw);
  const right = left + hw;
  // The word's middle: at the rule's left or right it keeps clear of the dot at that end.
  const inset = word / 2 + dot * 3;
  const cx = align === 'left' ? Math.min(left + inset, left + hw / 2) : align === 'right' ? Math.max(right - inset, left + hw / 2) : left + hw / 2;
  const rule = y + size * 2.15;
  const stroke = { fill: 'none', stroke: palette.accent, 'stroke-width': Math.max(0.5, size * 0.07), 'stroke-linecap': 'round' };
  const run = (from: number, to: number) => (to - from > size * 0.1 ? `M${n(from)},${n(rule)}L${n(to)},${n(rule)}` : '');
  return (
    el('text', { x: cx, y: y + size * 1.2, 'text-anchor': 'middle', ...fontAttrs(font), fill: palette.accent }, text(ctx.language.families)) +
    el('path', { d: run(left + dot * 2, cx - gap) + run(cx + gap, right - dot * 2), ...stroke }) +
    el('circle', { cx: n(left + dot), cy: n(rule), r: n(dot), fill: palette.accent }) +
    el('circle', { cx: n(right - dot), cy: n(rule), r: n(dot), fill: palette.accent }) +
    el('path', {
      d: `M${n(cx)},${n(rule - gap * 0.45)}L${n(cx + gap * 0.45)},${n(rule)}L${n(cx)},${n(rule + gap * 0.45)}L${n(cx - gap * 0.45)},${n(rule)}Z`,
      fill: palette.accent,
    })
  );
}

function fitText(t: string, f: FontSpec, max: number, measure: (t: string, f: FontSpec) => number): string {
  if (!t || measure(t, f) <= max) return t;
  const chars = Array.from(t);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(chars.slice(0, mid).join('').trimEnd() + '…', f) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? chars.slice(0, lo).join('').trimEnd() + '…' : '…';
}

function pickCenter(doc: TreeDocument, index: TreeIndex, settings: PrintSettings): string | undefined {
  if (settings.centerId && index.person(settings.centerId)) return settings.centerId;
  if (doc.meta.homePersonId && index.person(doc.meta.homePersonId)) return doc.meta.homePersonId;
  return doc.people[0]?.id;
}

function pickPartner(index: TreeIndex, centerId: string, settings: PrintSettings): string | undefined {
  if (settings.partnerId === null) return undefined;
  const fams = index.partnerFamilies(centerId).filter((f) => f.partners.length === 2);
  if (settings.partnerId && fams.some((f) => f.partners.includes(settings.partnerId!))) return settings.partnerId;
  const current = [...fams].reverse().find((f) => !isBrokenUp(relationshipStatus(f))) ?? fams[fams.length - 1];
  return current?.partners.find((p) => p !== centerId);
}

function yearRange(doc: TreeDocument): { from: number; to: number } | undefined {
  let from = Infinity;
  let to = -Infinity;
  for (const p of doc.people) {
    for (const e of [p.birth, p.death]) {
      const y = dateYear(e?.date);
      if (y !== undefined) {
        from = Math.min(from, y);
        to = Math.max(to, y);
      }
    }
  }
  return Number.isFinite(from) ? { from, to } : undefined;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
