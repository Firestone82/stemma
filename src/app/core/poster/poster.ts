/**
 * Draws a printable page of the tree: the part of the tree chosen in the print
 * settings, centred on a couple, in a print style, on a sheet of paper.
 * The result is a standalone SVG string; exporting turns it into PNG or PDF.
 */
import { Tincture, assignColors } from '../colors/tinctures';
import { Kin, kinship } from '../kinship/kinship';
import { chartLanguage, kinLabel, surnameLinesIn } from '../lang/language';
import { computeLayout } from '../layout/layout';
import { widestRow } from '../layout/tiering';
import { COMFORTABLE_LAYOUT, LayoutCard, LayoutOptions, LayoutResult, LayoutUnion, Pt, TUCK_OUT, TUCK_SCALE, TUCK_UP } from '../layout/layout-types';
import { connectorPaths, linkPath, unionLinePath, unionMarkerPoint } from '../layout/paths';
import { pictureBox } from '../layout/picture';
import { unionMark } from '../layout/union-marks';
import { dateYear } from '../model/dates';
import { initials, nameUnknown } from '../model/names';
import { RelationshipStatus, isBrokenUp, relationshipStatus } from '../model/relationship';
import { birthGroupOf } from '../model/births';
import { birthSurname } from '../model/surnames';
import { mourningRibbon, sexSymbolPath } from '../layout/symbols';
import { diedAtBirth } from '../model/completeness';
import { TreeRoom, branchTree } from '../layout/branch-tree';
import { TreeIndex } from '../model/tree-index';
import { BackgroundImage, DEFAULT_PRINT, LineStyle, PORTRAIT_ASPECT, Person, PrintSettings, TreeDocument, effectivePrint } from '../model/types';
import { drawMark } from './marks';
import { PX_PER_MM, paperSize } from './paper';
import {
  CardLine,
  CardLines,
  CardLook,
  CardText,
  FontSpec,
  PageBlock,
  PosterCardStyle,
  PosterContext,
  PosterTheme,
  Rect,
  SideBlock,
  UNKNOWN_DASH,
} from './poster-types';
import { scopeDocument } from './scope';
import { cssFont, el, fontAttrs, n, shieldPath, text } from './svg';
import { posterTheme } from './themes';

export interface PosterInput {
  doc: TreeDocument;
  /** Defaults to the document's print settings. */
  settings?: PrintSettings;
  /** Language of the words on the page, a BCP 47 tag. Defaults to the one the document was saved in. */
  language?: string;
  /** Square or curved family lines, as on the chart. Defaults to the print style's own. */
  lines?: LineStyle;
  /** Width of a text in a CSS font (canvas measureText in the browser). */
  measure(text: string, font: string): number;
  now?: Date;
  /** People left out of this print only (clicked away in the studio); the person in the middle stays. */
  omit?: ReadonlySet<string>;
}

export interface PosterResult {
  svg: string;
  /** Page size in CSS pixels (96 per inch). */
  width: number;
  height: number;
  /** Physical size, unless the page is sized to the tree. */
  paper?: { widthMm: number; heightMm: number; landscape: boolean };
  /** The size names print at, in points. */
  namePt: number;
  /** How big one card comes out on paper, in millimetres (a card stretched for a long name may be wider). */
  cardMm: { w: number; h: number };
  /** People on the page, and in the whole tree. */
  people: number;
  total: number;
  generations: number;
  centerId?: string;
  partnerId?: string;
  theme: PosterTheme;
  /**
   * Where the families' names are on the page, as shares of its width and
   * height; `free` when placed by hand (PrintSettings.legendBox).
   */
  legend?: { x: number; y: number; w: number; h: number; free: boolean };
  /** All text on the page, for embedding font subsets. */
  text: string;
}

/** A tree is not blown up beyond this on big paper; it would look like a children's book. */
const MAX_SCALE = 2.1;
/** How many layouts packing the families together may try (see packBranches). */
const PACK_TRIES = 10;
/** The page's unit of lettering (PosterContext.page.u) at most this share of the names' size on the cards: the title about three times as big as the names. */
const LETTERING = 0.75;
/** How hard rows are drawn in towards the middle (see LayoutOptions.squeeze). */
const SQUEEZES = [0.5, 1];
/** How many rows of stacked cards may be tried side by side (see renderPoster). */
const MAX_FLAT_TRIES = 14;
/** How many rows of couples may be stacked one after another (see renderPoster). */
const MAX_STACK_ROUNDS = 6;
/** More rows than any tree has: every row, for rows to leave as they are. */
const MAX_ROWS = 400;
/** What every print's cards are, whatever the settings say (see renderPoster). */
const PRINTED_CARDS: Partial<PrintSettings> = { showPhotos: false, showRelationships: false, portrait: 'round', portraitAlign: 'middle', portraitSize: 1 };
/** How much of the page the tree fills, in the direction that does not decide its size. */
const FILL = 0.97;
/** Gaps between families and brothers and sisters grow at most this many times to fill the width. */
const MAX_SPREAD = 4;
/** Places among their brothers and sisters tried for the person in the middle. */
const MAX_SIBLING_TRIES = 4;
const GUTTER = 64;
/** Room the sex symbol takes from the first line of a card. */
const SYMBOL_ROOM = 20;
/** The sex symbol's size, and how far its middle is from the card's top and right edges. */
const SYMBOL_SIZE = 15;
const SYMBOL_INSET = 16.5;
/** A card grows at most to this many times its width to fit a relationship name; beyond, the name is shortened. */
const MAX_CARD_STRETCH = 2;
const DASH: Record<string, string> = { adopted: '5 4', foster: '1.2 3.6', step: '9 4', unknown: '2 4' };

export function renderPoster(input: PosterInput): PosterResult {
  // Prints have no portraits (at print size they are too small to make out) and no relationship names; the
  // shields and monograms stand in the middle of the cards. Those settings are kept in the file, unused.
  const asked: PrintSettings = { ...DEFAULT_PRINT, ...(input.settings ?? effectivePrint(input.doc)), ...PRINTED_CARDS };
  // With families packed together the rows are no longer generations: no numbers beside them.
  const settings: PrintSettings = asked.packFamilies ? { ...asked, showGenerations: false } : asked;
  const theme = posterTheme(settings.theme);
  const language = chartLanguage(input.language ?? input.doc.view.language);
  const now = input.now ?? new Date();
  const fullIndex = new TreeIndex(input.doc);
  const centerId = pickCenter(input.doc, fullIndex, settings);
  const partnerId = centerId ? pickPartner(fullIndex, centerId, settings) : undefined;

  const doc = centerId
    ? scopeDocument(input.doc, fullIndex, {
        centerId,
        partnerId,
        ancestors: settings.ancestors,
        descendants: settings.descendants,
        branches: settings.branches,
        inLawFamilies: settings.inLawFamilies,
        showHidden: settings.showHidden,
        siblingsOnly: settings.siblingsOnly,
        omit: input.omit,
        nearFormerPartner: true,
      }).doc
    : { ...input.doc, people: [], families: [] };
  const index = new TreeIndex(doc);
  // Surnames at birth come from the whole tree: a father may be outside the part that is printed.
  // Everyone's is needed, so that families get the colours they have on the chart.
  const births = new Map(input.doc.people.map((p) => [p.id, birthSurname(fullIndex, p, language.surnameFor)]));
  const surnames = new Map(doc.people.map((p) => [p.id, surnameLinesIn(language, p, births.get(p.id))]));

  // Dates in full where they fit the card; years otherwise.
  const lifespanOf = (p: Person, max: number) => {
    if (!settings.fullDates) return language.lifespan(p);
    const full = language.lifespan(p, true);
    return fit(full, card.dates, max) === full ? full : language.lifespan(p);
  };
  const measure = (t: string, f: FontSpec) => input.measure(t, cssFont(f)) + (f.letterSpacing ?? 0) * f.size * Math.max(0, Array.from(t).length - 1);
  const fit = (t: string, f: FontSpec, max: number) => fitText(t, f, max, measure);

  // Relationship names, as seen from the person in the middle; their twins are named as such.
  const kin: ReadonlyMap<string, Kin> = centerId ? kinship(fullIndex, centerId) : new Map();
  const twins = centerId ? birthGroupOf(input.doc, centerId) : undefined;
  const bornWith = new Map(twins ? twins.memberIds.filter((m) => m !== centerId).map((m) => [m, twins.memberIds.length]) : []);
  const relations = new Map(doc.people.map((p) => [p.id, settings.showRelationships ? kinLabel(language, kin.get(p.id), p.sex, bornWith.get(p.id)) : '']));

  // Cards: every card has the same lines, so rows line up. The portraits (and the badges in their
  // place) can be made bigger; the text then starts further right and the card is wider by as much.
  const portraitScale = clamp(settings.portraitSize || 1, 0.5, 3);
  const grown = Math.round((portraitScale - 1) * theme.card.badge.size);
  // Without emblems the text starts where the emblem did, and the card is narrower by as much.
  const emblemRoom = settings.showEmblems === false ? theme.card.textX - theme.card.badge.x : 0;
  const card: PosterCardStyle = {
    ...theme.card,
    width: theme.card.width + grown - emblemRoom,
    textX: theme.card.textX + grown - emblemRoom,
    // No portraits on prints: they take no room either.
    photoRadius: settings.showPhotos ? theme.card.photoRadius * portraitScale : 0,
    badge: {
      ...theme.card.badge,
      kind: emblemRoom ? 'none' : theme.card.badge.kind,
      size: theme.card.badge.size * portraitScale,
      font: { ...theme.card.badge.font, size: theme.card.badge.font.size * Math.sqrt(portraitScale) },
    },
  };
  // The sex symbol sits in the top right corner; the first line stops short of it.
  const symbolRoom = settings.showSex ? SYMBOL_ROOM : 0;
  // A relationship name that does not fit makes its card wider.
  const widths = new Map<string, number>();
  for (const [id, relation] of relations) {
    const needed = Math.ceil(card.textX + measure(relation, card.kin) + symbolRoom + card.padRight);
    if (relation && needed > card.width) widths.set(id, Math.min(needed, card.width * MAX_CARD_STRETCH));
  }
  const lines = presentLines(
    theme,
    settings,
    [...surnames.values()].some((s) => !!s.birth),
  );
  const cardHeight = cardHeightFor(theme, lines, card);
  // Childless couples in the room of one card: the partner over the corner, or, with tall generations, under the card.
  let options: LayoutOptions = {
    ...COMFORTABLE_LAYOUT,
    ...theme.spacing,
    cardWidth: card.width,
    cardHeight,
    // Compact couples: childless ones stacked, and in rows too wide for them side by side, those with children too
    // (worked out below), which needs cards stacked under each other.
    compactChildless: settings.compactCouples,
    tuckBelow: settings.tallGenerations || settings.compactCouples,
  };
  // Cards tucked over a corner reach above their row: the lines in the gap above keep clear of them.
  if (options.compactChildless && !options.tuckBelow) options = { ...options, rowGap: options.rowGap + Math.round(cardHeight * TUCK_SCALE * TUCK_UP * 0.8) };
  // The document laid out: the tree as it is, or (to keep the person in the middle there) with their
  // brothers and sisters shared out on both sides of them.
  let laidOut = doc;
  const layoutWith = (o: LayoutOptions, d: TreeDocument = laidOut) => {
    const l = computeLayout(d, o, undefined, widths);
    return theme.flow === 'up' ? flipLayout(l) : l;
  };
  // Stacking only where asked for, at first: on paper without tall generations, in no row at all (rows
  // where it makes the cards bigger are found below). Laid out to fit, the childless are always stacked.
  if (settings.compactCouples && !settings.tallGenerations && paperSize(settings.paper)) {
    options = { ...options, flatRows: new Set(Array.from({ length: MAX_ROWS }, (_, r) => r)) };
  }
  let layout = layoutWith(options);

  const texts = new Map<string, CardText>();
  for (const p of doc.people) {
    const textWidth = (widths.get(p.id) ?? card.width) - card.textX - card.padRight;
    const names = surnames.get(p.id) ?? { surname: p.name.surname.trim(), birth: '' };
    const relation = relations.get(p.id) ?? '';
    texts.set(p.id, {
      kin: relation ? fit(relation, card.kin, textWidth - symbolRoom) : '',
      given: fit(nameUnknown(p) ? language.unknown(p.sex) : p.name.given.trim(), card.given, textWidth - (settings.showRelationships ? 0 : symbolRoom)),
      surname: fit(names.surname, card.surname, textWidth),
      birth: fit(names.birth, card.birth, textWidth),
      dates: settings.showDates ? fit(lifespanOf(p, textWidth), card.dates, textWidth) : '',
      place: '',
      initials: initials(p),
    });
  }

  // One colour per family name, as on the chart.
  const colors = assignColors(doc, 'family', layout.ranks, (p) => births.get(p.id) || p.name.surname.trim(), input.doc);
  const focusIds = [centerId, partnerId].filter((id): id is string => !!id && !!index.person(id));
  const rootIds = new Set<string>(focusIds);
  for (const id of focusIds) for (const a of index.ancestors(id)) rootIds.add(a);

  const generations = layout.rows.length;
  const title = settings.title?.trim() || input.doc.meta.title || 'Family tree';
  const subtitle = settings.subtitle?.trim() ?? (doc.people.length ? language.summary(generations, doc.people.length) : '');

  const defs = new Map<string, string>();
  const ctx: PosterContext = {
    theme,
    card,
    settings,
    language,
    doc,
    index,
    layout,
    options,
    page: { w: 0, h: 0, u: 0, margin: 0 },
    chart: { x: 0, y: 0, w: 0, h: 0 },
    scale: 1,
    colors: colors.byPerson,
    legend: colors.legend.map((l) => ({ ...l, label: l.key === '' ? language.others : l.label })),
    legendAt: 'below',
    kin,
    texts,
    lines,
    // Square or curved as on the chart; a style whose tree carries the lines draws them only without the tree.
    lineStyle: input.lines ?? (theme.line.style === 'branch' ? 'square' : theme.line.style),
    focusIds,
    rootIds,
    title,
    subtitle: settings.subtitle?.trim() === '' ? '' : subtitle,
    years: yearRange(doc),
    now,
    measure,
    fit,
    def: (id, markup) => {
      if (!defs.has(id)) defs.set(id, markup);
    },
    person: (id) => index.person(id),
    status: (familyId) => {
      const f = index.family(familyId);
      return f ? relationshipStatus(f) : 'unknown';
    },
  };

  const paper = paperSize(settings.paper);
  const gutter = settings.showGenerations && layout.rows.length ? GUTTER : 0;
  // A little room under the bottom row.
  const unionPad = 10;
  // Room above the oldest generation for the crown of the drawn tree (a picture of one's own fills the chart area as it is).
  const picture = settings.showTree ? input.doc.background : undefined;
  const crownPad = settings.showTree && !picture && theme.tree ? cardHeight * 0.7 : 0;

  /**
   * Fits a layout on the page: the content box, the orientation and the
   * scale. The tree is as big as the page allows, with no empty band beside
   * it; with the person kept in the middle, the tree is then slid across so
   * they come as near the middle of the page as that leaves room for.
   */
  const freeLegend = !!settings.legendBox;
  // The page's lettering and the families' names as big as asked for (see PrintSettings.titleScale, legendScale).
  const titleScale = clamp(settings.titleScale ?? 1, 0.5, 3);
  const legendScale = clamp(settings.legendScale ?? 1, 0.5, 3);
  const placeWith = (l: LayoutResult, uCap: number): Placed => {
    const b = l.bounds;
    const left = b.x - gutter;
    const right = b.x + b.w;
    const focusX = focusCenter(l, index, focusIds);
    const centred = settings.centered && focusX !== undefined;
    const cx = (left + right) / 2;
    const content: Rect = { x: left, y: b.y - crownPad, w: Math.max(right - left, 1), h: Math.max(b.h + unionPad + crownPad, 1) };
    if (!paper) {
      const base = clamp(Math.max(content.w, content.h) / 110, 8, 22);
      const margin = theme.margin * 100 * base;
      ctx.page = { w: content.w + margin * 2, h: 0, u: base * titleScale, lu: base * legendScale, margin };
      ctx.legendAt = freeLegend ? 'free' : 'below';
      const header = theme.header(ctx);
      const footer = theme.footer(ctx);
      ctx.page.h = content.h + margin * 2 + header.height + footer.height;
      const page = { ...ctx.page };
      const chart = { x: margin, y: margin + header.height, w: content.w, h: content.h };
      return {
        cx,
        content,
        header,
        footer,
        side: undefined,
        legendAt: ctx.legendAt,
        landscape: false,
        page,
        chart,
        anchor: chart.x + chart.w / 2,
        scale: 1,
        offCentre: 0,
      };
    }
    const portrait = { w: paper.widthMm * PX_PER_MM, h: paper.heightMm * PX_PER_MM };
    const candidates = settings.orientation === 'portrait' ? [false] : settings.orientation === 'landscape' ? [true] : [false, true];
    let best: Placed | undefined;
    for (const land of candidates) {
      // The legend under the tree, or (for styles that can) in a column beside it: whichever leaves the cards bigger.
      const legendPlaces = freeLegend ? (['free'] as const) : theme.side ? (['below', 'side'] as const) : (['below'] as const);
      for (const legendAt of legendPlaces) {
        const w = land ? portrait.h : portrait.w;
        const h = land ? portrait.w : portrait.h;
        const margin = theme.margin * Math.min(w, h);
        const base = Math.min(Math.min(w, h) / 100, uCap);
        ctx.page = { w, h, u: base * titleScale, lu: base * legendScale, margin };
        ctx.legendAt = legendAt;
        const header = theme.header(ctx);
        const footer = theme.footer(ctx);
        const chartH = Math.max(10, h - margin * 2 - header.height - footer.height);
        const side = legendAt === 'side' ? theme.side?.(ctx, chartH) : undefined;
        if (legendAt === 'side' && !side) continue;
        const chart = { x: margin, y: margin + header.height, w: Math.max(10, w - margin * 2 - (side?.width ?? 0)), h: chartH };
        const scale = Math.min(chart.w / content.w, chart.h / content.h, MAX_SCALE);
        // Where the middle of the content goes across the page. Room left over beside the tree (the
        // height decides its size) lets the person in the middle move towards the middle of the page.
        const slack = Math.max(0, (chart.w - content.w * scale) / 2);
        const mid = chart.x + chart.w / 2;
        const anchor = centred ? clamp(w / 2 - (focusX! - cx) * scale, mid - slack, mid + slack) : mid;
        const offCentre = centred ? Math.abs(anchor + (focusX! - cx) * scale - w / 2) / w : 0;
        const better =
          !best ||
          scale > best.scale * 1.02 ||
          // About as big: the one with the person nearer the middle.
          (scale > best.scale * 0.98 && offCentre < best.offCentre - 0.02);
        if (better) best = { cx, content, landscape: land, scale, header, footer, side, legendAt, page: { ...ctx.page }, chart, anchor, offCentre };
      }
    }
    return best!;
  };
  // The title, the legend and the rest of the page's lettering in proportion to the names on the cards, not
  // only to the paper: on a big sheet full of small cards they would otherwise dwarf the tree. Smaller
  // lettering leaves the tree more room, so the cards grow a little and the lettering with them.
  const place = (l: LayoutResult): Placed => {
    let placed = placeWith(l, Infinity);
    if (!paper) return placed;
    for (let round = 0; round < 3; round++) {
      const cap = LETTERING * card.given.size * placed.scale;
      if (cap >= (placed.page.u / titleScale) * 0.98) break;
      placed = placeWith(l, cap);
    }
    return placed;
  };

  let placed = place(layout);
  // Rows too wide to stand side by side: their couples with children stacked under each other, the line to
  // the children out at the side (see LayoutOptions.stackParents), the widest row first, as long as the width
  // decides the size and the cards get bigger.
  if (paper && settings.compactCouples) {
    const widthDecides = (p: Placed) => p.chart.w / p.content.w <= p.chart.h / p.content.h + 1e-9;
    const stackedRows = new Set<number>();
    for (let round = 0; round < MAX_STACK_ROUNDS && widthDecides(placed) && placed.scale < MAX_SCALE; round++) {
      let found: PackTry | undefined;
      // The widest row; the next one only when stacking that one does not help.
      for (const row of rowsByWidth(layout)
        .filter((r) => !stackedRows.has(r))
        .slice(0, 2)) {
        if (found) break;
        const flatRows = new Set(options.flatRows ?? []);
        flatRows.delete(row);
        const trialOptions = { ...options, flatRows, stackParentRows: new Set([...stackedRows, row]) };
        const trialLayout = layoutWith(trialOptions);
        const trialPlaced = place(trialLayout);
        if (trialPlaced.scale > (found ?? { placed }).placed.scale * 1.01) found = { options: trialOptions, layout: trialLayout, placed: trialPlaced };
      }
      if (!found) break;
      ({ options, layout, placed } = found);
      for (const r of options.stackParentRows ?? []) stackedRows.add(r);
    }
  }
  // Keeping the person in the middle: they may stand elsewhere among their brothers and sisters, when
  // that brings them nearer the middle of the page without making the cards smaller. A few places at most,
  // as each is a layout of its own.
  if (paper && settings.centered && centerId) {
    const start = placed;
    for (const shared of siblingsAround(doc, index, centerId).slice(0, MAX_SIBLING_TRIES)) {
      const trialLayout = layoutWith(options, shared);
      const trialPlaced = place(trialLayout);
      if (trialPlaced.scale > start.scale * 0.95 && trialPlaced.offCentre < placed.offCentre - 0.02) {
        laidOut = shared;
        layout = trialLayout;
        placed = trialPlaced;
      }
    }
  }
  // A wide tree on narrow paper: the widest generations are drawn in two
  // tiers, every other card a step lower, as long as that makes the cards bigger.
  // With tall generations asked for, rows are stacked more readily: more of them, for a smaller gain.
  const tall = settings.tallGenerations;
  if (paper && placed.scale < MAX_SCALE) {
    const tiers: number[] = [];
    const tryTiers = (trialOptions: LayoutOptions) => {
      const trialLayout = layoutWith(trialOptions);
      const trialPlaced = place(trialLayout);
      if (trialPlaced.scale < placed.scale * (tall ? 1.05 : 1.1)) return false;
      options = trialOptions;
      layout = trialLayout;
      placed = trialPlaced;
      return true;
    };
    for (let attempt = 0; attempt < (tall ? 5 : 3); attempt++) {
      const wide = placed.chart.h / placed.content.h > (placed.chart.w / placed.content.w) * (tall ? 0.9 : 1.25);
      const widest = widestRow(layout, tiers);
      if (!wide || widest === undefined) break;
      if (!tryTiers({ ...options, tierGenerations: [...tiers, widest] })) break;
      tiers.push(widest);
    }
  }
  // No empty corners: rows drawn inside the widest one, parents then not always right over their children
  // (see LayoutOptions.squeeze), as little as gives the biggest cards, for the straightest lines.
  const squeezed = (from: PackTry): PackTry => {
    let best = from;
    for (const squeeze of SQUEEZES) {
      const trialOptions = { ...from.options, squeeze };
      const trialLayout = layoutWith(trialOptions);
      const trialPlaced = place(trialLayout);
      if (trialPlaced.scale > best.placed.scale * 1.01) best = { options: trialOptions, layout: trialLayout, placed: trialPlaced };
    }
    return best;
  };
  const widthBound = (p: Placed) => p.chart.w / p.content.w <= p.chart.h / p.content.h + 1e-9;
  if (paper && placed.scale < MAX_SCALE) {
    const unpacked: PackTry = { options, layout, placed };
    let best = squeezed(unpacked);
    // Generations not in rows: whole branches drawn a row lower, wherever that lets the families beside them
    // spread out and so makes the cards bigger (see packBranches), then drawn in as above. Only when the
    // width still decides the size: hanging branches lower makes the tree taller.
    if (settings.packFamilies && best.placed.scale < MAX_SCALE && widthBound(best.placed)) {
      const packed = packBranches(
        doc,
        rootIds,
        layout,
        (sink) => {
          const trialOptions = { ...options, sink };
          const trialLayout = layoutWith(trialOptions);
          return { options: trialOptions, layout: trialLayout, placed: place(trialLayout) };
        },
        placed.scale,
      );
      if (packed) {
        const packedIn = squeezed(packed);
        if (packedIn.placed.scale > best.placed.scale * 1.01) best = packedIn;
      }
    }
    ({ options, layout, placed } = best);
  }
  // Room to spare across the page (the height decides the size, as with narrower cards without emblems):
  // rows with cards stacked under each other are laid out side by side again, lower and wider, where that
  // makes the cards bigger, those with most stacked cards first.
  if (paper && options.tuckBelow && placed.scale < MAX_SCALE && !widthBound(placed)) {
    const stacked = new Map<number, number>();
    // (Couples only: brothers and sisters with nobody beside or under them stay stacked, the tree as narrow as it gets.)
    const couple = (a: string, b: string) => index.partnerFamilies(a).some((f) => f.partners.includes(b));
    for (const c of layout.cards) {
      const row = layout.ranks.get(c.personId);
      if (c.tuckedOn && row !== undefined && couple(c.personId, c.tuckedOn)) stacked.set(row, (stacked.get(row) ?? 0) + 1);
    }
    for (const [row] of [...stacked].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, MAX_FLAT_TRIES)) {
      const trialOptions = { ...options, flatRows: new Set([...(options.flatRows ?? []), row]) };
      const trialLayout = layoutWith(trialOptions);
      const trialPlaced = place(trialLayout);
      if (trialPlaced.scale <= placed.scale * 1.01) continue;
      options = trialOptions;
      layout = trialLayout;
      placed = trialPlaced;
      if (widthBound(placed)) break;
    }
  }
  // The tree fills the page: when the width decides the size, the generations
  // are spread out to the full height; when the height decides it, the
  // families are spread out to the full width.
  const gaps = new Set(layout.ranks.values()).size - 1;
  if (paper && gaps > 0 && placed.scale < MAX_SCALE) {
    const room = (placed.chart.h * FILL) / placed.scale - placed.content.h;
    const extra = room / gaps;
    if (extra > 12) {
      const trialOptions = { ...options, rowGap: options.rowGap + extra };
      const trialLayout = layoutWith(trialOptions);
      const trialPlaced = place(trialLayout);
      if (trialPlaced.scale >= placed.scale * 0.99) {
        options = trialOptions;
        layout = trialLayout;
        placed = trialPlaced;
      }
    }
  }
  if (paper && placed.scale < MAX_SCALE) {
    // Wider gaps make the tree wider by about as much as the gaps already take; a few tries close in on the width wanted.
    for (let attempt = 0; attempt < 4; attempt++) {
      const want = (placed.chart.w * FILL) / placed.scale;
      const missing = want - placed.content.w;
      if (missing < placed.content.w * 0.02) break;
      const spread = Math.min(1 + missing / Math.max(gapWidth(layout), 1), MAX_SPREAD / spreadOf(options));
      if (spread < 1.02) break;
      const trialOptions = spreadOut(options, spread);
      const trialLayout = layoutWith(trialOptions);
      const trialPlaced = place(trialLayout);
      // Too wide now: the cards would shrink. Halfway is tried next.
      if (trialPlaced.scale < placed.scale * 0.995) {
        const halfway = spreadOut(options, 1 + (spread - 1) / 2);
        const halfLayout = layoutWith(halfway);
        const halfPlaced = place(halfLayout);
        if (halfPlaced.scale < placed.scale * 0.995) break;
        options = halfway;
        layout = halfLayout;
        placed = halfPlaced;
        continue;
      }
      options = trialOptions;
      layout = trialLayout;
      placed = trialPlaced;
    }
  }
  ctx.layout = layout;
  ctx.options = options;
  ctx.page = placed.page;
  ctx.chart = placed.chart;
  ctx.scale = placed.scale;
  ctx.legendAt = placed.legendAt;
  const { header, footer, side, landscape, content, cx } = placed;

  const s = ctx.scale;
  const tx = placed.anchor - cx * s;
  const ty = ctx.chart.y + (ctx.chart.h - content.h * s) / 2 - content.y * s;
  const margin = ctx.page.margin;
  // The space between header and footer, in the chart's own units: the tree may fill it.
  const room: TreeRoom = { x: (ctx.chart.x - tx) / s, y: (ctx.chart.y - ty) / s, w: ctx.chart.w / s, h: ctx.chart.h / s };

  const headerRect = { x: margin, y: margin, w: ctx.page.w - margin * 2, h: header.height };
  const footerRect = { x: margin, y: ctx.page.h - margin - footer.height, w: ctx.page.w - margin * 2, h: footer.height };
  const sideRect = side && { x: ctx.chart.x + ctx.chart.w, y: ctx.chart.y, w: side.width, h: ctx.chart.h };
  // The box with the families' names: placed by hand, or where the style put them (for the preview to offer moving it).
  const box = settings.legendBox;
  const legendRect: Rect | undefined = box
    ? { x: box.x * ctx.page.w, y: box.y * ctx.page.h, w: box.w * ctx.page.w, h: box.h * ctx.page.h }
    : (sideRect && side?.legend?.(sideRect)) || footer.legend?.(footerRect) || header.legend?.(headerRect);

  const body = [
    theme.background(ctx),
    header.draw(headerRect),
    `<g transform="translate(${n(tx)},${n(ty)}) scale(${n(s)})">${drawChart(ctx, gutter, room)}</g>`,
    footer.draw(footerRect),
    (sideRect && side?.draw(sideRect)) ?? '',
    box && legendRect ? drawLegendBox(ctx, legendRect) : '',
    theme.overlay?.(ctx) ?? '',
  ].join('');

  const W = ctx.page.w;
  const H = ctx.page.h;
  const sizeAttrs = paper ? `width="${n(W / PX_PER_MM)}mm" height="${n(H / PX_PER_MM)}mm"` : `width="${Math.ceil(W)}" height="${Math.ceil(H)}"`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ${sizeAttrs} viewBox="0 0 ${n(W)} ${n(H)}">` +
    (defs.size ? `<defs>${[...defs.values()].join('')}</defs>` : '') +
    body +
    `</svg>`;

  const allText = [
    title,
    ctx.subtitle,
    language.drawn(now),
    ...[...texts.values()].flatMap((t) => [t.kin, t.given, t.surname, t.birth, t.dates, t.place, t.initials]),
    ...ctx.legend.map((l) => l.label),
    'IVXLCDM0123456789–·,. ?',
  ].join('');

  return {
    svg,
    width: W,
    height: H,
    paper: paper ? { widthMm: W / PX_PER_MM, heightMm: H / PX_PER_MM, landscape } : undefined,
    namePt: card.given.size * s * 0.75,
    cardMm: { w: (card.width * s) / PX_PER_MM, h: (cardHeight * s) / PX_PER_MM },
    people: doc.people.length,
    total: input.doc.people.length,
    generations,
    centerId,
    partnerId,
    theme,
    text: allText,
    legend: legendRect && { x: legendRect.x / W, y: legendRect.y / H, w: legendRect.w / W, h: legendRect.h / H, free: !!box },
  };
}

/** The families' names fitted into a box: as many columns as make the names biggest, the whole lot centred in it. */
function drawLegendBox(ctx: PosterContext, box: Rect): string {
  const entries = ctx.legend.filter((l) => l.key !== '' || ctx.legend.length > 1);
  if (!entries.length) return '';
  const style = ctx.theme.legendStyle;
  const REF = 100;
  // Widths at text 1 unit big: mark, space, label.
  const widths = entries.map((l) => style.markW + style.markGap + ctx.measure(l.label, { ...style.font, size: REF }) / REF);
  const ROW = 1.9;
  const COL_GAP = 1.6;
  let best = { size: 0, columns: 1, colW: [] as number[] };
  for (let columns = 1; columns <= entries.length; columns++) {
    const rows = Math.ceil(entries.length / columns);
    const colW = Array.from({ length: columns }, (_, c) => Math.max(0, ...widths.slice(c * rows, (c + 1) * rows)));
    const size = Math.min(box.h / (rows * ROW), box.w / (colW.reduce((a, b) => a + b, 0) + COL_GAP * (columns - 1)));
    if (size > best.size) best = { size, columns, colW };
  }
  const size = Math.min(best.size, ctx.page.u * 8);
  const rows = Math.ceil(entries.length / best.columns);
  const totalW = (best.colW.reduce((a, b) => a + b, 0) + COL_GAP * (best.columns - 1)) * size;
  const font = { ...style.font, size };
  let out = '';
  let x = box.x + (box.w - totalW) / 2;
  const top = box.y + (box.h - rows * ROW * size) / 2;
  best.colW.forEach((w, c) => {
    entries.slice(c * rows, (c + 1) * rows).forEach((l, r) => {
      const y = top + (r + 0.5) * ROW * size;
      out += style.mark(ctx, l, x, y, size);
      out += el('text', { x: x + (style.markW + style.markGap) * size, y: y + size * 0.34, ...fontAttrs(font), fill: style.ink }, text(l.label));
    });
    x += (w + COL_GAP) * size;
  });
  return `<g class="pp-legend">${out}</g>`;
}

// ---------------------------------------------------------------------------
// families packed together

interface PackTry {
  options: LayoutOptions;
  layout: LayoutResult;
  placed: Placed;
}

/**
 * Generations not in rows (PrintSettings.packFamilies): the children of one
 * family, with everyone below them, drawn a row lower than their generation,
 * so that the families beside them can spread out above or beside them and
 * the tree gets narrower. The families in the widest row are tried one at a
 * time, the best kept, and the same again for what is then the widest row,
 * as long as the cards get bigger. The direct line of the person in the
 * middle stays in its rows.
 */
function packBranches(
  doc: TreeDocument,
  direct: ReadonlySet<string>,
  start: LayoutResult,
  layoutWith: (sink: ReadonlyMap<string, number>) => PackTry,
  startScale: number,
): PackTry | undefined {
  const inTree = new Set(doc.people.map((p) => p.id));
  // Each family's children in the tree, for families of children who may go lower.
  const groups = doc.families
    .map((f) => f.children.map((c) => c.personId).filter((id) => inTree.has(id)))
    .filter((kids) => kids.length && !kids.some((id) => direct.has(id)));
  let best: PackTry | undefined;
  let bestScale = startScale;
  let layout = start;
  const sink = new Map<string, number>();
  let tries = 0;
  for (let round = 0; round < 4 && tries < PACK_TRIES; round++) {
    const row = widestRank(layout);
    if (row === undefined) break;
    const candidates = groups.filter((kids) => kids.some((id) => layout.ranks.get(id) === row) && !kids.some((id) => sink.has(id)));
    let found: { tried: PackTry; kids: string[] } | undefined;
    for (const kids of candidates) {
      if (tries++ >= PACK_TRIES) break;
      const trial = new Map(sink);
      for (const id of kids) trial.set(id, 1);
      const tried = layoutWith(trial);
      if (tried.placed.scale > bestScale * 1.01) {
        bestScale = tried.placed.scale;
        found = { tried, kids };
      }
    }
    if (!found) break;
    for (const id of found.kids) sink.set(id, 1);
    best = found.tried;
    layout = best.layout;
  }
  return best;
}

/** The rows, the widest first (as LayoutResult.ranks numbers them). */
function rowsByWidth(layout: LayoutResult): number[] {
  const span = new Map<number, { lo: number; hi: number }>();
  for (const c of layout.cards) {
    const rank = layout.ranks.get(c.personId) ?? c.rank;
    const s = span.get(rank) ?? { lo: Infinity, hi: -Infinity };
    span.set(rank, { lo: Math.min(s.lo, c.x), hi: Math.max(s.hi, c.x + c.w) });
  }
  return [...span].sort((a, b) => b[1].hi - b[1].lo - (a[1].hi - a[1].lo)).map(([r]) => r);
}

/** The row whose cards reach the furthest from one end to the other. */
function widestRank(layout: LayoutResult): number | undefined {
  const span = new Map<number, { lo: number; hi: number }>();
  for (const c of layout.cards) {
    // Rows as LayoutResult.ranks numbers them (card ranks count the extra rows between generations too).
    const rank = layout.ranks.get(c.personId) ?? c.rank;
    const s = span.get(rank) ?? { lo: Infinity, hi: -Infinity };
    span.set(rank, { lo: Math.min(s.lo, c.x), hi: Math.max(s.hi, c.x + c.w) });
  }
  let widest: number | undefined;
  let width = 0;
  for (const [rank, s] of span) {
    if (s.hi - s.lo > width) {
      width = s.hi - s.lo;
      widest = rank;
    }
  }
  return widest;
}

// ---------------------------------------------------------------------------
// the tree itself

/** A layout fitted on the page: see renderPoster's `place`. */
interface Placed {
  /** How far the person in the middle is from the middle of the page, as a share of its width; 0 when that is not asked for. */
  offCentre: number;
  cx: number;
  content: Rect;
  landscape: boolean;
  scale: number;
  header: PageBlock;
  footer: PageBlock;
  side: SideBlock | undefined;
  legendAt: PosterContext['legendAt'];
  page: PosterContext['page'];
  chart: Rect;
  /** Where the content's `cx` is put across the page. */
  anchor: number;
}

function drawChart(ctx: PosterContext, gutter: number, room: TreeRoom): string {
  const { layout, theme, settings } = ctx;
  const parts: string[] = [];
  const pal = theme.palette;

  // The tree or picture behind everything, then the generation numbers over it.
  const tree = settings.showTree && !ctx.doc.background ? theme.tree : undefined;
  if (settings.showTree && ctx.doc.background) parts.push(drawPicture(ctx, ctx.doc.background, room));
  else if (tree) parts.push(drawTree(ctx, room));

  if (settings.showGenerations && gutter) {
    const x = layout.bounds.x - gutter / 2;
    layout.rows.forEach((row, i) => {
      const y = row.y + row.h / 2;
      parts.push(theme.generationLabel ? theme.generationLabel(ctx, row.label, x, y, i) : defaultGenerationLabel(ctx, row.label, x, y));
    });
  }

  const focus = focusRect(ctx);
  if (focus)
    parts.push(
      theme.focus
        ? theme.focus(ctx, focus)
        : el('rect', { x: focus.x, y: focus.y, width: focus.w, height: focus.h, rx: 8, fill: 'none', stroke: pal.accent, 'stroke-width': 2 }),
    );

  // A tree whose branches are the family lines needs no lines drawn over it.
  if (!tree?.lines) parts.push(theme.connectors ? theme.connectors(ctx) : defaultConnectors(ctx));
  for (const l of layout.links) {
    parts.push(
      el('path', {
        d: linkPath(l),
        fill: 'none',
        stroke: pal.line,
        'stroke-width': theme.line.width,
        'stroke-dasharray': '3 4',
        'stroke-linecap': 'round',
        opacity: 0.85,
      }),
    );
  }

  for (const u of layout.unions) {
    if (u.mode === 'tucked') continue;
    const d = unionLinePath(u, ctx.lineStyle);
    if (d && theme.unionLine) parts.push(theme.unionLine(ctx, u, d));
    else if (d)
      parts.push(el('path', { d, fill: 'none', stroke: pal.line, 'stroke-width': theme.line.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const at = unionMarkerPoint(u);
    if (!at) continue;
    const { x: mx, y: my } = at;
    parts.push(theme.unionMarker ? theme.unionMarker(ctx, u, mx, my) : defaultUnionMarker(ctx, u, mx, my));
  }

  for (const p of layout.placeholders) {
    parts.push(
      `<g transform="translate(${n(p.cx)},${n(p.cy)})">` +
        el('rect', {
          x: n(-p.w / 2),
          y: n(-p.h / 2),
          width: n(p.w),
          height: n(p.h),
          rx: theme.card.radius,
          fill: pal.card,
          stroke: pal.muted,
          'stroke-width': 1.1,
          'stroke-dasharray': '4 3',
        }) +
        el(
          'text',
          {
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            ...fontAttrs({ family: theme.card.given.family, size: Math.round(p.h * 0.42), weight: 600 }),
            fill: pal.muted,
          },
          '?',
        ) +
        `</g>`,
    );
  }

  // Full cards first, then the small cards tucked over them, then those couples' markers, so nothing is covered.
  const covered = new Set(ctx.options.tuckBelow ? [] : layout.cards.map((c) => c.tuckedOn).filter((id): id is string => !!id));
  for (const c of layout.cards) if (!c.tuckedOn) parts.push(drawCard(ctx, c, covered.has(c.personId)));
  for (const c of layout.cards) if (c.tuckedOn) parts.push(drawCard(ctx, c));
  for (const u of layout.unions) {
    if (u.mode !== 'tucked') continue;
    const d = unionLinePath(u, ctx.lineStyle);
    if (d && theme.unionLine) parts.push(theme.unionLine(ctx, u, d));
    else if (d)
      parts.push(el('path', { d, fill: 'none', stroke: pal.line, 'stroke-width': theme.line.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    parts.push(theme.unionMarker ? theme.unionMarker(ctx, u, u.cx, u.cy) : defaultUnionMarker(ctx, u, u.cx, u.cy));
  }
  return parts.join('');
}

function drawCard(ctx: PosterContext, at: LayoutCard, covered = false): string {
  const { theme, settings } = ctx;
  const card = ctx.card;
  const pal = theme.palette;
  const t = ctx.texts.get(at.personId);
  const person = ctx.person(at.personId);
  if (!t || !person) return '';
  // A card tucked over a corner is a full card drawn smaller; one stacked under its partner's is full size.
  const scale = at.tuckedOn && !ctx.options.tuckBelow ? TUCK_SCALE : 1;
  const c: LayoutCard = scale === 1 ? at : { ...at, w: at.w / scale, h: at.h / scale };
  const look: CardLook = {
    focus: ctx.focusIds.includes(c.personId),
    fill: settings.sexColors && person.sex === 'male' ? pal.cardMale : settings.sexColors && person.sex === 'female' ? pal.cardFemale : pal.card,
    unknown: nameUnknown(person),
  };
  const tincture = theme.tinctures[ctx.colors.get(c.personId) ?? 'argent'];
  const parts: string[] = [theme.cardShape ? theme.cardShape(ctx, c, look) : defaultCardShape(ctx, c, look)];
  // A black ribbon across the top left corner for someone who has died; a white one for a child who died at birth.
  if (person.death) {
    const atBirth = diedAtBirth(person);
    parts.push(
      el('path', {
        d: mourningRibbon(c.h),
        fill: atBirth ? '#fbf9f4' : '#1b1918',
        stroke: atBirth ? '#1b1918' : pal.cardEdge,
        'stroke-width': atBirth ? 0.9 : 0.5,
      }),
    );
  }
  // The sex symbol in the top right corner, unless a partner's card lies there.
  if (settings.showSex && !covered) {
    const d = sexSymbolPath(person.sex, SYMBOL_SIZE);
    const color = person.sex === 'male' ? pal.male : person.sex === 'female' ? pal.female : pal.kin;
    if (d)
      parts.push(
        `<path transform="translate(${n(c.w - SYMBOL_INSET)},${SYMBOL_INSET})" d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
  }

  // The lines a card has: every card has the same set, so rows line up, but a line this person
  // has nothing for (no surname at birth, no place) takes no room on their card.
  const lines = ctx.lines;
  const specs: { value: string; spec: CardLine; fill: string }[] = [];
  if (lines.kin && t.kin) specs.push({ value: t.kin, spec: card.kin, fill: pal.kin });
  specs.push({ value: t.given, spec: card.given, fill: look.unknown ? pal.muted : pal.ink });
  if (t.surname) specs.push({ value: t.surname, spec: card.surname, fill: pal.ink });
  if (lines.birth && t.birth) specs.push({ value: t.birth, spec: card.birth, fill: pal.muted });
  if (lines.dates && t.dates) specs.push({ value: t.dates, spec: card.dates, fill: pal.muted });
  if (lines.place && t.place) specs.push({ value: t.place, spec: card.place, fill: pal.faint });
  const blockH = specs.length ? specs[0].spec.size * 0.74 + specs.slice(1).reduce((h, l) => h + l.spec.step, 0) : 0;
  const middle = settings.portraitAlign !== 'top';
  // Where the text starts: at the top of the card, or with the block of lines in the middle.
  let textTop = middle ? Math.max(card.top, (c.h - blockH) / 2) : card.top;

  const photo = settings.showPhotos ? person.photo : undefined;
  const badge = card.badge;
  const shape = settings.portrait;
  const round = shape === 'round';
  // The portrait or badge: beside the first lines at the top, or in the middle of the card.
  const badgeH = badge.kind === 'shield' ? badge.size * 1.18 : badge.size;
  const portraitCy = (h: number) => (middle ? c.h / 2 : Math.min(card.top + h / 2, c.h / 2));
  if (photo) {
    const r = card.photoRadius;
    // Round and square portraits show the middle of the stored picture; a rectangle shows it whole, upright.
    const pw = r * 2;
    const ph = shape === 'rectangle' ? Math.min(pw * PORTRAIT_ASPECT, c.h - 8) : pw;
    const cx = badge.x + badge.size / 2;
    const cy = portraitCy(ph);
    const id = `pp-photo-${c.personId}`;
    const rx = Math.min(4, r * 0.2);
    const window = round
      ? `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`
      : `<rect x="${n(cx - pw / 2)}" y="${n(cy - ph / 2)}" width="${n(pw)}" height="${n(ph)}" rx="${n(rx)}"/>`;
    ctx.def(id, `<clipPath id="${id}">${window}</clipPath>`);
    parts.push(
      round
        ? el('circle', { cx, cy, r: r + 1.5, fill: tincture.fill, stroke: tincture.edge })
        : el('rect', { x: cx - pw / 2 - 1.5, y: cy - ph / 2 - 1.5, width: pw + 3, height: ph + 3, rx: rx + 1, fill: tincture.fill, stroke: tincture.edge }),
    );
    parts.push(
      el('image', { href: photo, x: cx - pw / 2, y: cy - ph / 2, width: pw, height: ph, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${id})` }),
    );
  } else if (badge.kind === 'shield') {
    const w = badge.size;
    const h = badgeH;
    parts.push(
      `<g transform="translate(${n(badge.x)},${n(portraitCy(h) - h / 2)})">` +
        el('path', { d: shieldPath(w, h), fill: tincture.fill, stroke: tincture.edge, 'stroke-width': tincture.edge ? 0.9 : undefined }) +
        el(
          'text',
          { x: w / 2, y: h * 0.47, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...fontAttrs(badge.font), fill: tincture.ink },
          text(t.initials),
        ) +
        `</g>`,
    );
  } else if (badge.kind === 'seal') {
    const r = badge.size / 2;
    const cx = badge.x + r;
    const cy = portraitCy(badge.size);
    parts.push(
      round
        ? el('circle', { cx, cy, r, fill: tincture.fill, stroke: tincture.edge, 'stroke-width': tincture.edge ? 0.9 : undefined })
        : el('rect', {
            x: cx - r,
            y: cy - r,
            width: r * 2,
            height: r * 2,
            rx: r * 0.3,
            fill: tincture.fill,
            stroke: tincture.edge,
            'stroke-width': tincture.edge ? 0.9 : undefined,
          }),
    );
    parts.push(
      el(
        'text',
        { x: cx, y: cy + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...fontAttrs(badge.font), fill: tincture.ink },
        text(t.initials),
      ),
    );
  } else if (badge.kind === 'bar') {
    parts.push(el('rect', { x: 0, y: 0, width: badge.size, height: c.h, fill: tincture.fill === theme.tinctures.argent.fill ? pal.cardEdge : tincture.fill }));
  }

  // A partner's small card over the top right corner: the lines start under it when
  // they fit, otherwise the lines beside it stop short of it.
  const tuck = covered ? { left: c.w - c.w * TUCK_SCALE * (1 - TUCK_OUT) - 3, bottom: c.h * TUCK_SCALE * (1 - TUCK_UP) } : undefined;
  if (tuck && textTop < tuck.bottom + 3 && tuck.bottom + 3 + blockH <= c.h - 6) textTop = tuck.bottom + 3;
  let y = textTop;
  specs.forEach((l, i) => {
    y += i === 0 ? l.spec.size * 0.74 : l.spec.step;
    const value = tuck && y - l.spec.size * 0.74 < tuck.bottom ? ctx.fit(l.value, l.spec, tuck.left - card.textX) : l.value;
    parts.push(el('text', { x: card.textX, y, ...fontAttrs(l.spec), fill: l.fill }, text(value)));
  });

  const transform = `translate(${n(c.x)},${n(c.y)})${scale === 1 ? '' : ` scale(${n(scale)})`}`;
  return el('g', { class: 'card', 'data-person': c.personId, transform }, parts.join(''));
}

function defaultCardShape(ctx: PosterContext, c: LayoutCard, look: CardLook): string {
  const pal = ctx.theme.palette;
  return el('rect', {
    x: 0,
    y: 0,
    width: c.w,
    height: c.h,
    rx: ctx.theme.card.radius,
    fill: look.fill,
    stroke: look.focus ? pal.ink : pal.cardEdge,
    'stroke-width': look.focus ? 1.5 : 0.9,
    'stroke-dasharray': look.unknown ? UNKNOWN_DASH : undefined,
  });
}

/**
 * The person's own picture over the whole chart area, as it is: an SVG stays
 * a drawing in SVG files and is drawn at full resolution in PDF and PNG.
 */
function drawPicture(ctx: PosterContext, picture: BackgroundImage, room: TreeRoom): string {
  const clip = 'pp-picture-room';
  ctx.def(clip, `<clipPath id="${clip}"><rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}"/></clipPath>`);
  const box = pictureBox(room, picture);
  const image = el('image', {
    href: picture.href,
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    opacity: picture.opacity < 1 ? picture.opacity : undefined,
  });
  return `<g clip-path="url(#${clip})">${image}</g>`;
}

/** The tree behind the chart, painted in the style's colours. */
function drawTree(ctx: PosterContext, room: TreeRoom): string {
  const t = ctx.theme.tree;
  if (!t) return '';
  // The tree always grows upwards from the couple; a chart drawn the other way up gets a mirrored tree.
  const flipped = ctx.theme.flow === 'up';
  const L = ctx.layout;
  const axis = L.bounds.y * 2 + L.bounds.h;
  const treeRoom = flipped ? { ...room, y: axis - room.y - room.h } : room;
  const shape = branchTree(flipped ? flipLayout(L) : L, ctx.index, ctx.focusIds, { room: treeRoom });
  if (!shape) return '';
  const f = shape.foliage;
  const fill = (color: string, parts: readonly string[]) => (parts.length ? `<path fill="${color}" d="${parts.join('')}"/>` : '');
  // Twigs under the leaves, small masses of leaves, the wood over them, and single leaves and blossom over everything.
  let art = fill(t.wood, shape.twigs);
  art += fill(t.canopy[0], f.shade) + fill(t.canopy[1], f.body) + fill(t.canopy[2], f.light);
  art += fill(t.wood, shape.wood);
  if (t.bark && shape.bark.length)
    art += `<path fill="none" stroke="${t.bark}" stroke-width="1.1" stroke-linecap="round" opacity="0.6" d="${shape.bark.join('')}"/>`;
  f.leaves.forEach((leaves, i) => (art += fill(t.leaves[i % t.leaves.length], leaves)));
  if (t.bloom) shape.blooms.forEach((blooms, i) => (art += fill(t.bloom![i], blooms)));
  const clip = 'pp-tree-room';
  ctx.def(clip, `<clipPath id="${clip}"><rect x="${n(treeRoom.x)}" y="${n(treeRoom.y)}" width="${n(treeRoom.w)}" height="${n(treeRoom.h)}"/></clipPath>`);
  const tree = `<g clip-path="url(#${clip})" opacity="${n(t.opacity)}">${art}</g>`;
  return flipped ? `<g transform="translate(0,${n(axis)}) scale(1,-1)">${tree}</g>` : tree;
}

function defaultConnectors(ctx: PosterContext): string {
  const { theme, layout } = ctx;
  const out: string[] = [];
  for (const c of layout.connectors) {
    for (const p of connectorPaths(c, ctx.lineStyle, theme.line.radius)) {
      out.push(
        el('path', {
          d: p.d,
          fill: 'none',
          stroke: theme.palette.line,
          'stroke-width': theme.line.width,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-dasharray': DASH[p.relation],
        }),
      );
    }
  }
  return out.join('');
}

function defaultUnionMarker(ctx: PosterContext, u: LayoutUnion, x: number, y: number): string {
  const pal = ctx.theme.palette;
  return drawMark(unionMark(u.kind, ctx.status(u.familyId), 4.6), x, y, {
    plate: pal.card,
    plateEdge: pal.cardEdge,
    ring: pal.accent,
    ringApart: pal.muted,
    dot: pal.line,
    cut: pal.break,
  });
}

function defaultGenerationLabel(ctx: PosterContext, label: string, x: number, y: number): string {
  return el(
    'text',
    { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', ...fontAttrs(ctx.theme.generationFont), fill: ctx.theme.palette.faint },
    text(label),
  );
}

// ---------------------------------------------------------------------------
// helpers

/** Which optional lines the cards have. `birth`: someone on the page was born with another surname. */
export function presentLines(theme: PosterTheme, settings: PrintSettings, birth = false): CardLines {
  void theme;
  // Places are no longer printed, whatever `showPlaces` says.
  return { kin: settings.showRelationships, birth, dates: settings.showDates, place: false };
}

export function cardHeightFor(theme: PosterTheme, lines: CardLines, card: PosterCardStyle = theme.card): number {
  const c = card;
  const specs: CardLine[] = [];
  if (lines.kin) specs.push(c.kin);
  specs.push(c.given, c.surname);
  if (lines.birth) specs.push(c.birth);
  if (lines.dates) specs.push(c.dates);
  if (lines.place) specs.push(c.place);
  let y = c.top + specs[0].size * 0.74;
  for (const s of specs.slice(1)) y += s.step;
  // At least as high as the portrait (an upright one is taller than wide) or badge, with a little room.
  const badge = c.badge.kind === 'shield' ? c.badge.size * 1.18 : c.badge.kind === 'none' ? 0 : c.badge.size;
  const portrait = Math.max(c.photoRadius * 2 * PORTRAIT_ASPECT, badge) + 12;
  return Math.round(Math.max(y + c.bottom, portrait));
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

/** Where the couple in the middle is: their union marker, or the person's card. */
function focusCenter(layout: LayoutResult, index: TreeIndex, focusIds: readonly string[]): number | undefined {
  if (!focusIds.length) return undefined;
  if (focusIds.length === 2) {
    const fam = index.familyBetween(focusIds[0], focusIds[1]);
    const u = fam ? layout.unions.find((x) => x.familyId === fam.id && (x.mode === 'gap' || x.mode === 'bridge')) : undefined;
    if (u) return u.cx;
  }
  const c = layout.cards.find((x) => x.personId === focusIds[0]);
  return c ? c.x + c.w / 2 : undefined;
}

/** The gaps between neighbours in a layout's widest row, which spreading the tree out widens. */
function gapWidth(layout: LayoutResult): number {
  const rows = new Map<number, LayoutCard[]>();
  for (const c of layout.cards) {
    if (c.tuckedOn) continue;
    const row = rows.get(c.y) ?? [];
    row.push(c);
    rows.set(c.y, row);
  }
  let widest = 0;
  for (const row of rows.values()) {
    const x0 = Math.min(...row.map((c) => c.x));
    const x1 = Math.max(...row.map((c) => c.x + c.w));
    const cards = row.reduce((sum, c) => sum + c.w, 0);
    if (x1 - x0 > widest) widest = Math.max(0, x1 - x0 - cards);
  }
  return widest;
}

/** The gaps the tree is spread out by (see spreadOut), as a share of the comfortable ones. */
function spreadOf(o: LayoutOptions): number {
  return o.siblingGap / COMFORTABLE_LAYOUT.siblingGap;
}

/** The gaps between brothers and sisters, families and separate trees `by` times as wide; partners stay together. */
function spreadOut(o: LayoutOptions, by: number): LayoutOptions {
  return { ...o, siblingGap: o.siblingGap * by, familyGap: o.familyGap * by, componentGap: o.componentGap * by };
}

/**
 * The ways the person in the middle can stand among their brothers and
 * sisters other than the way they do: at each other place in the row, the
 * others in birth order round them, so the tree can spread round them
 * instead of off to one side.
 */
export function siblingsAround(doc: TreeDocument, index: TreeIndex, personId: string): TreeDocument[] {
  const family = index.primaryParentFamily(personId);
  if (!family || family.children.length < 2) return [];
  const self = family.children.find((c) => c.personId === personId)!;
  const others = family.children.filter((c) => c !== self);
  const out: TreeDocument[] = [];
  for (let at = 0; at <= others.length; at++) {
    const children = [...others.slice(0, at), self, ...others.slice(at)];
    if (children.every((c, i) => c === family.children[i])) continue;
    out.push({ ...doc, families: doc.families.map((f) => (f.id === family.id ? { ...f, children } : f)) });
  }
  return out;
}

function focusRect(ctx: PosterContext): Rect | undefined {
  const cards = ctx.layout.cards.filter((c) => ctx.focusIds.includes(c.personId));
  if (!cards.length) return undefined;
  const sameRow = cards.every((c) => c.y === cards[0].y);
  const use = sameRow ? cards : cards.filter((c) => c.personId === ctx.focusIds[0]);
  const pad = 7;
  const x0 = Math.min(...use.map((c) => c.x)) - pad;
  const x1 = Math.max(...use.map((c) => c.x + c.w)) + pad;
  const y0 = Math.min(...use.map((c) => c.y)) - pad;
  const y1 = Math.max(...use.map((c) => c.y + c.h)) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The first and last year anyone on the page was born or died. */
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

/** Turns the chart upside down (oldest at the bottom) without turning the cards. */
export function flipLayout(L: LayoutResult): LayoutResult {
  const top = L.bounds.y;
  const bottom = L.bounds.y + L.bounds.h;
  const fy = (y: number) => top + bottom - y;
  const fp = (p: Pt): Pt => ({ x: p.x, y: fy(p.y) });
  return {
    ...L,
    cards: L.cards.map((c) => ({ ...c, y: fy(c.y + c.h) })),
    placeholders: L.placeholders.map((p) => ({ ...p, cy: fy(p.cy) })),
    unions: L.unions.map((u) => ({ ...u, cy: fy(u.cy), line: u.line.map(fp) })),
    connectors: L.connectors.map((c) => ({
      ...c,
      stem: fp(c.stem),
      clearY: fy(c.clearY),
      barY: fy(c.barY),
      drops: c.drops.map((d) => ({
        ...d,
        points: d.points.map(fp),
        through: d.through?.map((t) => ({ x: t.x, from: fy(t.from), to: fy(t.to) })),
      })),
    })),
    links: L.links.map((l) => ({ ...l, from: fp(l.from), clearY: fy(l.clearY), to: fp(l.to) })),
    rows: L.rows.map((r) => ({ ...r, y: fy(r.y + r.h), top: fy(r.bottom), bottom: fy(r.top) })),
    lanes: L.lanes.map((r) => ({ ...r, y: fy(r.y + r.h), top: fy(r.bottom), bottom: fy(r.top) })),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export type { Tincture, RelationshipStatus };
