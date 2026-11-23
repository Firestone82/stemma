import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { bloodRelatives } from '../../core/kinship/kinship';
import { CutLine, cutOff } from '../../core/model/cut-off';
import { GAP_WIDEST } from '../../core/layout/gaps';
import { forgetPrintFor, savePrintFor, savedPrintOf, updatePrint, useSavedPrint } from '../../core/model/operations';
import { isBrokenUp, relationshipStatus } from '../../core/model/relationship';
import { Anchor, DEFAULT_PRINT, Reach, LEGEND_GAP_CM, LegendBox, anchorShares, effectivePrint, PrintSettings } from '../../core/model/types';
import { CARD_WIDTH } from '../../core/card/card-design';
import { PAPERS, PX_PER_MM } from '../../core/poster/paper';
import { escapeText } from '../../core/xml/xml-writer';
import { pdfFromJpeg, pdfPages, tilePages } from '../../core/poster/pdf';
import { SETTINGS_PAGE, SettingsSheet, settingsPageSvg, settingsText } from '../../core/poster/settings-page';
import { TileGrid, tileGrid } from '../../core/poster/tiles';
import { Steps } from '../../core/layout/steps';
import { PosterInput, PosterResult, ProgressStep, forgetLayouts, posterSteps, scopeOptions } from '../../core/poster/poster';
import { ADDABLE, Addable, RELATIVES, Relatives, relativesSettings, relativesToAdd, scopeDocument } from '../../core/poster/scope';
import { FONTS, palette } from '../../core/poster/heritage';
import { FileIo, safeFilename } from '../../core/services/file-io';
import { ImageExporter } from '../../core/services/image-export';
import { TextMeasurer } from '../../core/services/text-measure';
import { ToastService } from '../../core/services/toast';
import { TreeStore } from '../../core/store/tree-store';
import { I18n } from '../../i18n/i18n';
import { MessageKey } from '../../i18n/locales';
import { STATUS_LABEL } from '../../i18n/labels';
import { UiState } from '../../state/ui-state';

/** The print settings that lay the tree out anew: changing one puts back the cards moved and lines led by hand. */
const RELAYOUT = new Set<keyof PrintSettings>([
  'paper',
  'orientation',
  'centerId',
  'partnerId',
  'ancestors',
  'descendants',
  'branches',
  'inLawFamilies',
  'siblingsOnly',
  'tight',
  'fill',
  'stackCouples',
  'amidPartners',
  'freeWidths',
  'largeText',
  'strongLines',
  'cardGap',
  'lineGap',
  'layoutChoice',
  'flipped',
]);

export type PrintOutput = 'print' | 'pdf' | 'png' | 'svg';

/** Whether two sets of print settings print the same, whatever order their keys are in. */
export function samePrint(a: PrintSettings, b: PrintSettings): boolean {
  const x = a as unknown as Record<string, unknown>;
  const y = b as unknown as Record<string, unknown>;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].every((key) => JSON.stringify(x[key]) === JSON.stringify(y[key]));
}

/**
 * The page is drawn a piece at a time, so many milliseconds of work and then whatever the window has waiting (a
 * key pressed, a click, a frame to paint): the window never stops answering, however long the page takes.
 */
const SLICE_MS = 16;
/** A page that takes longer than this gets a note over the one shown before (see PrintModel.drawing); most are there sooner. */
const NOTE_AFTER_MS = 180;
/**
 * Settings that are typed. While only these change, a page that takes a while (the one before took longer than
 * SLOW_MS) waits until the typing stops, so long after the last key; a quick one follows every key.
 */
const TYPED: ReadonlySet<string> = new Set<keyof PrintSettings>(['title', 'subtitle', 'titleSize', 'legendSize']);
const TYPING_PAUSE_MS = 450;
const SLOW_MS = 120;

/** Whether the page asked for now differs from the one asked for before only in what is typed (TYPED). */
export function onlyTyped(before: PosterInput, now: PosterInput): boolean {
  const a = before.doc;
  const b = now.doc;
  // (Every change stamps the tree's `modified`, so its title and home person are compared and not `meta` as a whole.)
  const same = a.people === b.people && a.families === b.families && a.view === b.view && a.meta.title === b.meta.title;
  if (!same || a.meta.homePersonId !== b.meta.homePersonId || before.language !== now.language) return false;
  const left = before.omit ?? new Set<string>();
  const out = now.omit ?? new Set<string>();
  if (left.size !== out.size || [...left].some((id) => !out.has(id))) return false;
  const was = (before.settings ?? {}) as unknown as Record<string, unknown>;
  const is = (now.settings ?? {}) as unknown as Record<string, unknown>;
  return [...new Set([...Object.keys(was), ...Object.keys(is)])].every((key) => TYPED.has(key) || was[key] === is[key]);
}

/** Does `work` as a task of its own, after whatever the window has waiting, without the few milliseconds a timer would add each time. */
const soon: (work: () => void) => void = (() => {
  if (typeof MessageChannel === 'undefined') return (work: () => void) => void setTimeout(work);
  const channel = new MessageChannel();
  const queue: (() => void)[] = [];
  channel.port1.onmessage = () => queue.shift()?.();
  return (work: () => void) => {
    queue.push(work);
    channel.port2.postMessage(0);
  };
})();

/** Resolution for PNG and PDF files of paper sizes. */
const PRINT_DPI = 200;

/**
 * The print studio's state and work: the page drawn from the print settings,
 * the choices offered, and making the files. Settings are saved with the tree.
 */
/**
 * The narrowest card wanted on a paper whose shorter side is so long, in millimetres: a smaller one is printed
 * all the same, with a warning (see PrintModel.sizeNote). A bigger sheet is looked at from further away, so its
 * cards may not be smaller; a small sheet is held in the hand, and can do with smaller ones. 40 mm on A1, about
 * 26 on A4 and 46 on A0. For a card as wide as the usual (CARD_WIDTH); a narrower one (no shield) in proportion.
 */
export function minCardMm(shortMm: number, cardUnits = CARD_WIDTH): number {
  return Math.round(40 * Math.pow(shortMm / 594, 0.4) * (cardUnits / CARD_WIDTH));
}

/**
 * The smallest A paper, bigger than the one so big (`w`, `h`), on which cards now `cardMm` wide come out no
 * narrower than that paper wants (the cards grow with the page about as much).
 */
export function paperFor(w: number, h: number, cardMm: number, cardUnits = CARD_WIDTH): (typeof PAPERS)[number] | undefined {
  const short = Math.min(w, h);
  return PAPERS.filter((p) => p.id.startsWith('A') && p.widthMm > short * 1.01)
    .sort((a, b) => a.widthMm - b.widthMm)
    .find((p) => cardMm * (p.widthMm / short) >= minCardMm(p.widthMm, cardUnits) * 0.99);
}

@Injectable({ providedIn: 'root' })
export class PrintModel {
  private readonly store = inject(TreeStore);
  private readonly ui = inject(UiState);
  private readonly measure = inject(TextMeasurer);
  private readonly exporter = inject(ImageExporter);
  private readonly files = inject(FileIo);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18n);

  /** The browser print dialog is not available inside the artifact viewer. */
  readonly canPrint = !this.files.hosted;
  readonly fontsReady = signal(false);
  readonly busy = signal<PrintOutput | null>(null);

  readonly settings = computed<PrintSettings>(() => ({ ...DEFAULT_PRINT, ...effectivePrint(this.store.doc()) }));

  /**
   * Changes that wait to be applied: where the title and the families' names stand and how big they are. Each
   * would draw the page again, which takes a while for a big tree, and they are rarely right at the first go:
   * they are shown on the page as it is (stagedBoxes) until applied, in one step, or discarded.
   */
  readonly staged = signal<Partial<PrintSettings>>({});
  /** The settings as they will be once what waits is applied: what the settings show. */
  readonly view = computed<PrintSettings>(() => ({ ...this.settings(), ...this.staged() }));
  readonly waiting = computed(() => Object.keys(this.staged()).length > 0);
  /** Boxes as they were applied, until the page drawn around them arrives: they stay there meanwhile. */
  private readonly held = signal<Partial<Record<'legend' | 'title', LegendBox>>>({});

  /** What the page is drawn from, only while the studio is open and the fonts can be measured. */
  private readonly request = computed<PosterInput | null>(() => {
    if (!this.ui.printOpen() || !this.fontsReady()) return null;
    this.measure.fontsVersion();
    const doc = this.store.doc();
    if (!doc.people.length) return null;
    // The words on the page are in the app's language.
    return {
      doc,
      settings: this.settings(),
      language: this.i18n.code(),
      measure: (t, f) => this.measure.width(t, f),
      omit: new Set(this.ui.printOmitted()),
      report: (step, detail) => this.note.set(this.progressText(step, detail)),
    };
  });

  /** The page as last drawn. */
  readonly poster = signal<PosterResult | null>(null);
  /**
   * Set while a page that takes a while is drawn: the page before stays, with
   * a note over it. The work is done a piece at a time (SLICE_MS), so the
   * studio keeps answering; a change of a setting meanwhile drops it and
   * starts the page that is wanted now.
   */
  readonly drawing = signal(false);
  /** What the work is busy with just now, in words: shown over the page while it takes long (see PosterInput.report). */
  readonly note = signal('');
  /** The page is drawn, and the other arrangements that come out about as well are being looked for behind it. */
  readonly seeking = signal(false);

  private progressText(step: ProgressStep, detail?: Record<string, string | number>): string {
    const t = this.i18n.t;
    const d = detail ?? {};
    switch (step) {
      case 'start':
        return t('print.progress.start', { people: d['people'] ?? 0 });
      case 'orientation':
        return t('print.progress.orientation', {
          paper: d['paper'] ?? '',
          orientation: t(d['landscape'] ? 'print.orientation.landscape' : 'print.orientation.portrait').toLocaleLowerCase(this.i18n.locale().intl),
        });
      case 'names':
        return t('print.progress.names');
      case 'lettering':
        return t('print.progress.lettering', { round: d['round'] ?? 1 });
      case 'alternatives':
        return t('print.progress.alternatives');
      case 'draw':
        return t('print.progress.draw', { cards: d['cards'] ?? 0 });
    }
  }

  /** Counts the pages asked for: work on any but the latest stops at its next piece. */
  private drawn = 0;
  private asked: PosterInput | null = null;
  private typing: ReturnType<typeof setTimeout> | undefined;
  private noting: ReturnType<typeof setTimeout> | undefined;
  /** How long the last page took to draw, in milliseconds of work. */
  private took = 0;

  /** How many people were clicked away from this print. */
  readonly omittedCount = computed(() => this.ui.printOmitted().length);

  constructor() {
    effect(() => {
      const request = this.request();
      untracked(() => this.draw(request));
    });
    // Another tree: nobody is left out of its prints yet, and nothing of the last one waits.
    effect(() => {
      this.store.loadId();
      untracked(() => {
        this.ui.clearPrintOmitted();
        this.staged.set({});
      });
    });
  }

  private draw(request: PosterInput | null): void {
    // Whatever was being drawn is for settings that are no longer wanted.
    const turn = ++this.drawn;
    clearTimeout(this.typing);
    clearTimeout(this.noting);
    const before = this.asked;
    this.asked = request;
    if (!request) {
      this.poster.set(null);
      this.drawing.set(false);
      // The studio is closed: the work kept for drawing its page again quickly is let go of.
      forgetLayouts();
      return;
    }
    const start = () => {
      if (turn !== this.drawn) return;
      this.noting = setTimeout(() => {
        if (turn === this.drawn) this.drawing.set(true);
      }, NOTE_AFTER_MS);
      // The page first, with the best arrangement; then, behind it, the others that come out about as well (to
      // pick from). A page asked for in one of those others is drawn with them at once.
      const quick = !request.settings?.layoutChoice && request.effort !== 'quick';
      this.seeking.set(false);
      this.work(turn, posterSteps(quick ? { ...request, alternatives: false } : request), 0, () => {
        if (!quick) return;
        this.seeking.set(true);
        this.work(turn, posterSteps({ ...request, report: undefined }), 0, () => this.seeking.set(false), true);
      });
    };
    // While somebody is typing, a page that takes a while is drawn once they have stopped.
    if (before && this.took > SLOW_MS && onlyTyped(before, request)) this.typing = setTimeout(start, TYPING_PAUSE_MS);
    else start();
  }

  /** The page's steps, so many milliseconds' worth at a time, until it is drawn or another page is asked for. */
  private work(turn: number, steps: Steps<PosterResult>, spent: number, then?: () => void, behind = false): void {
    if (turn !== this.drawn) {
      if (behind) this.seeking.set(false);
      return;
    }
    const from = performance.now();
    const until = from + SLICE_MS;
    const done = () => {
      if (behind) return;
      clearTimeout(this.noting);
      this.drawing.set(false);
      this.note.set('');
      this.took = spent + performance.now() - from;
    };
    try {
      for (;;) {
        const step = steps.next();
        if (step.done) {
          // Looked for behind the page: the same page, now with the other arrangements to pick from.
          if (behind) this.poster.update((p) => (p ? { ...p, layouts: step.value.layouts, layoutChoice: step.value.layoutChoice } : step.value));
          else {
            this.poster.set(step.value);
            this.held.set({});
          }
          done();
          then?.();
          return;
        }
        if (performance.now() >= until) break;
      }
    } catch (error) {
      done();
      if (behind) this.seeking.set(false);
      throw error;
    }
    soon(() => this.work(turn, steps, spent + performance.now() - from, then, behind));
  }

  /** A change that waits to be applied, with any that wait already. */
  stage(patch: Partial<PrintSettings>): void {
    this.staged.update((s) => ({ ...s, ...patch }));
  }

  /** What waits, applied: one step, the page drawn again once. */
  applyStaged(): void {
    const patch = this.staged();
    if (!Object.keys(patch).length) return;
    this.held.set(this.stagedBoxes());
    this.staged.set({});
    this.set(patch, 'print place');
  }

  /** What waits, forgotten; true when anything did. */
  discardStaged(): boolean {
    const any = this.waiting();
    this.staged.set({});
    return any;
  }

  /**
   * Where the title and the families' names will be once what waits is applied, as shares of the page, worked
   * out from the page as it is: for showing them there before it is drawn again. Close to where the page will
   * put them, not always exactly (the frame's corners, names that need more room than their box).
   */
  readonly stagedBoxes = computed<Partial<Record<'legend' | 'title', LegendBox>>>(() => {
    const p = this.poster();
    const staged = this.staged();
    if (!p?.paper) return {};
    if (!Object.keys(staged).length) return this.held();
    const v = this.view();
    const has = (...keys: (keyof PrintSettings)[]) => keys.some((k) => k in staged);
    const ratio = (to: number, from: number) => (from > 0 ? to / from : 1);
    const inner = p.inner;
    const out: Partial<Record<'legend' | 'title', LegendBox>> = {};
    let title = p.title;
    if (p.title && has('titleAnchor', 'titleAt', 'titleSize')) {
      const k = ratio(v.titleSize ?? p.lettering.autoTitleCm, p.lettering.titleCm);
      const w = p.title.w * k;
      const h = p.title.h * k;
      title = {
        ...(v.titleAnchor ? placeIn(inner, v.titleAnchor, w, h) : v.titleAt ? { x: v.titleAt.x - w / 2, y: v.titleAt.y, w, h } : placeIn(inner, 'top', w, h)),
        free: true,
      };
      out.title = title;
    }
    if (p.legend && (has('legendBox', 'legendAnchor', 'legendSize', 'legendAlign', 'legendGap') || (out.title && v.legendAnchor))) {
      const k = v.legendBox ? 1 : ratio(v.legendSize ?? p.lettering.autoLegendCm, p.lettering.legendCm);
      const size = v.legendBox ?? { w: p.legend.w * k, h: p.legend.h * k };
      let box: LegendBox = v.legendAnchor
        ? placeIn(inner, v.legendAnchor, size.w, size.h)
        : v.legendBox
          ? { ...v.legendBox }
          : { x: p.legend.x + (p.legend.w - size.w) / 2, y: p.legend.y + p.legend.h - size.h, w: size.w, h: size.h };
      // Held at the top or the foot where the title is: under it, or over it.
      if (v.legendAnchor && title) {
        const gap = ((v.legendGap ?? LEGEND_GAP_CM) * 10) / p.paper.heightMm;
        const across = box.x < title.x + title.w && title.x < box.x + box.w;
        const meet = box.y < title.y + title.h + gap && title.y < box.y + box.h + gap;
        if (across && meet) box = { ...box, y: box.y + box.h / 2 < 0.5 ? title.y + title.h + gap : title.y - gap - box.h };
      }
      out.legend = box;
    }
    return out;
  });

  /**
   * Where the title and the families' names stand, as the top left corner of their boxes in centimetres from
   * the left and the top of the paper (as they will once what waits is applied); null on a page sized to the tree.
   */
  readonly boxCm = computed(() => {
    const p = this.poster();
    if (!p?.paper) return null;
    const cm = 1 / (PX_PER_MM * 10);
    const boxes = this.stagedBoxes();
    const at = (b?: { x: number; y: number }) => (b ? { x: b.x * p.width * cm, y: b.y * p.height * cm } : undefined);
    return { w: p.width * cm, h: p.height * cm, title: at(boxes.title ?? p.title), legend: at(boxes.legend ?? p.legend) };
  });

  /**
   * The gap kept between the title's box and the names' box (PrintSettings.legendGap), as shares of the page's
   * width and height: what a box being moved snaps to when it comes that far from the other.
   */
  readonly boxGap = computed(() => {
    const p = this.poster();
    if (!p?.paper) return null;
    const cm = (this.view().legendGap ?? LEGEND_GAP_CM) * 10;
    return { x: cm / p.paper.widthMm, y: cm / p.paper.heightMm };
  });

  /** The least and the most the heading over the names can be wide, in centimetres: the width of the names' box. */
  readonly headRangeCm = computed(() => {
    const p = this.poster();
    const box = this.stagedBoxes().legend ?? p?.legend;
    if (!p?.paper || !box) return { min: 1, max: 20 };
    const max = Math.max(1, Math.round(((box.w * p.width) / (PX_PER_MM * 10)) * 10) / 10);
    return { min: Math.min(1, max), max };
  });

  /** Puts the title or the families' names at a coordinate, in centimetres from the left or the top of the paper (what waits is applied later). */
  setBoxCm(which: 'title' | 'legend', axis: 'x' | 'y', cm: number): void {
    const p = this.poster();
    const page = this.boxCm();
    if (!p || !page) return;
    const boxes = this.stagedBoxes();
    const box = which === 'title' ? (boxes.title ?? p.title) : (boxes.legend ?? p.legend);
    if (!box) return;
    const share = Math.min(Math.max(cm / (axis === 'x' ? page.w : page.h), 0), 1 - (axis === 'x' ? box.w : box.h));
    const next = { x: box.x, y: box.y, w: box.w, h: box.h, [axis]: Math.max(0, share) };
    if (which === 'title') this.stage({ titleAt: { x: next.x + next.w / 2, y: next.y }, titleAnchor: undefined });
    else this.stage({ legendBox: { x: next.x, y: next.y, w: next.w, h: next.h }, legendAnchor: undefined });
  }

  /**
   * Leaves a person out of this print (from their card's menu); the person in the middle stays. Someone brought
   * onto it by hand is no longer brought (that is kept with the tree); left out for now as well, if the print
   * would show them all the same.
   */
  omit(personId: string): void {
    if (personId === this.centerId()) return;
    const added = this.settings().added ?? [];
    if (!added.includes(personId)) {
      this.ui.omitFromPrint([personId]);
      return;
    }
    const rest = added.filter((id) => id !== personId);
    this.set({ added: rest.length ? rest : undefined }, `print add ${++this.stepCount}`);
    const p = this.poster();
    if (!p?.centerId) return;
    const scope = scopeDocument(this.store.doc(), this.store.index(), scopeOptions(this.settings(), p.centerId, p.partnerId, new Set(this.ui.printOmitted())));
    if (scope.people.has(personId)) this.ui.omitFromPrint([personId]);
  }

  /**
   * Who a card's menu would bring onto the print, for each choice (see relativesToAdd): only those not on it
   * now, and not those hidden from prints (unless they are printed too).
   */
  addable(personId: string): Readonly<Record<Addable, readonly string[]>> {
    const index = this.store.index();
    const shown = new Set(this.poster()?.shown ?? []);
    const showHidden = this.settings().showHidden;
    const out = {} as Record<Addable, readonly string[]>;
    for (const what of ADDABLE)
      out[what] = relativesToAdd(index, personId, what).filter((id) => !shown.has(id) && (showHidden || !index.person(id)?.hiddenFromPrint));
    return out;
  }

  /** Brings a person's parents, brothers and sisters or whole family onto the print, as one step; kept with the tree. */
  add(personId: string, what: Addable): void {
    const ids = this.addable(personId)[what];
    if (!ids.length) return;
    const added = [...new Set([...(this.settings().added ?? []), ...ids])];
    // Every addition is a step of its own to undo, however quickly one follows another.
    this.set({ added }, `print add ${++this.stepCount}`);
    this.ui.keepInPrint(ids);
  }

  /** How many people have been brought onto the print by hand (and are still in the tree). */
  readonly addedCount = computed(() => {
    const index = this.store.index();
    return (this.settings().added ?? []).filter((id) => !!index.person(id)).length;
  });

  /**
   * The gap the layout keeps between two people's cards side by side: partners, brothers and sisters (children
   * of one family), or anyone else (families). For a card dragged next to another (see PrintPreview).
   */
  readonly gapFor = computed(() => {
    const gaps = this.poster()?.gaps;
    const index = this.store.index();
    if (!gaps) return null;
    return (a: string, b: string): number => {
      if (index.familyBetween(a, b)) return gaps.partner;
      const parents = new Set(index.parentFamilies(a).map((f) => f.id));
      if (index.parentFamilies(b).some((f) => parents.has(f.id))) return gaps.sibling;
      return gaps.family;
    };
  });

  /** Whether someone has a partner on the print beside them (or over or under them): their sides can be swapped. */
  hasPartnerShown(personId: string): boolean {
    const shown = new Set(this.poster()?.shown ?? []);
    return this.store
      .index()
      .partnerFamilies(personId)
      .some((f) => f.partners.some((p) => p !== personId && shown.has(p)));
  }

  /** Whether someone's partners stand on the other side of them than the layout would put them. */
  isFlipped(personId: string): boolean {
    return (this.settings().flipped ?? []).includes(personId);
  }

  /** Swaps the sides someone's partners stand on (or back), as one step; kept with the tree. */
  flip(personId: string): void {
    const flipped = this.settings().flipped ?? [];
    const next = flipped.includes(personId) ? flipped.filter((id) => id !== personId) : [...flipped, personId];
    this.set({ flipped: next.length ? next : undefined }, `print flip ${++this.stepCount}`);
  }

  /** Nobody brought onto the print by hand any more. */
  clearAdded(): void {
    this.set({ added: undefined }, `print add ${++this.stepCount}`);
  }

  /**
   * A click on a line: everyone who hangs on it goes, in one step. A line joins a child to their parents (the
   * stretch under the parents is every child's); taken away, whoever is no longer joined to the person in the
   * middle is left out. Where the tree stays in one piece without it (cousins who married), only the children go.
   */
  omitBranch(cuts: readonly CutLine[]): void {
    this.ui.omitFromPrint(cutOff(this.store.index(), this.poster()?.shown ?? [], this.centerId(), cuts));
  }

  /** Moves a card by hand, from where it is now: the lines to it follow. */
  moveCard(personId: string, dx: number, dy: number, alone = false): void {
    const moves = { ...(this.settings().moves ?? {}) };
    const at = moves[personId] ?? { x: 0, y: 0 };
    const r = (v: number) => Math.round(v * 10) / 10;
    // Alone (Ctrl held): only the card goes; its partner and children stay where they are.
    const x = r(at.x + (alone ? 0 : dx));
    const y = r(at.y + (alone ? 0 : dy));
    const sx = r((at.sx ?? 0) + (alone ? dx : 0));
    const sy = r((at.sy ?? 0) + (alone ? dy : 0));
    const small = (v: number) => Math.abs(v) < 0.5;
    if (small(x) && small(y) && small(sx) && small(sy)) delete moves[personId];
    else moves[personId] = small(sx) && small(sy) ? { x, y } : { x, y, sx, sy };
    // Every move is a step of its own to undo, however quickly one follows another.
    this.set({ moves: Object.keys(moves).length ? moves : undefined }, `print move ${++this.stepCount}`);
  }

  /** Puts one card, or all of them, back where the layout has them. */
  unmove(personId?: string): void {
    const moves = { ...(this.settings().moves ?? {}) };
    if (personId) delete moves[personId];
    this.set({ moves: personId && Object.keys(moves).length ? moves : undefined });
  }

  /** Keeps a line as it was led by hand (its points in the layout's units, start to end). */
  bendLine(key: string, points: readonly { x: number; y: number }[]): void {
    const r = (v: number) => Math.round(v * 10) / 10;
    const bends = { ...(this.settings().lineBends ?? {}), [key]: points.map((p) => ({ x: r(p.x), y: r(p.y) })) };
    this.set({ lineBends: bends }, `print bend ${++this.stepCount}`);
  }

  /** Lets one line, or all of them, be led by the layout again. */
  unbend(key?: string): void {
    const bends = { ...(this.settings().lineBends ?? {}) };
    if (key) delete bends[key];
    this.set({ lineBends: key && Object.keys(bends).length ? bends : undefined });
  }

  readonly bentCount = computed(() => Object.keys(this.settings().lineBends ?? {}).length);

  /**
   * Makes the gap between two cards (see gapKey) so much wider than the layout has it, in the layout's units, or
   * (0 or less) leaves it as the layout has it again. Each change is a step of its own to undo.
   */
  setGap(key: string, by: number): void {
    const gaps = { ...(this.settings().gaps ?? {}) };
    const wider = Math.min(GAP_WIDEST, Math.round(by));
    if (wider > 0) gaps[key] = wider;
    else delete gaps[key];
    this.set({ gaps: Object.keys(gaps).length ? gaps : undefined }, `print gap ${++this.stepCount}`);
  }

  /** Every gap made wider by hand as the layout has it again. */
  ungap(): void {
    this.set({ gaps: undefined }, `print gap ${++this.stepCount}`);
  }

  readonly gappedCount = computed(() => Object.keys(this.settings().gaps ?? {}).length);

  /** Counts what is done by hand on the page (moves, additions), so each is a step of its own to undo. */
  private stepCount = 0;

  readonly movedCount = computed(() => Object.keys(this.settings().moves ?? {}).length);

  /** Someone's name, for the menu of their card. */
  nameOf(personId: string): string {
    return this.i18n.name(this.store.index().person(personId));
  }

  /** Brings everyone clicked away back. */
  restoreOmitted(): void {
    this.ui.clearPrintOmitted();
  }

  /** Everyone, for choosing who goes in the middle. */
  readonly people = computed(() =>
    this.store
      .doc()
      .people.map((p) => ({ id: p.id, name: this.i18n.sortName(p), dates: this.i18n.lifespan(p) }))
      .sort((a, b) => this.i18n.compare(a.name, b.name)),
  );

  readonly centerId = computed(() => this.poster()?.centerId ?? this.store.doc().meta.homePersonId ?? '');

  readonly partners = computed(() => {
    const index = this.store.index();
    const id = this.centerId();
    return index
      .partnerFamilies(id)
      .filter((f) => f.partners.length === 2)
      .map((f) => {
        const other = f.partners.find((p) => p !== id)!;
        const status = this.i18n.t(STATUS_LABEL[relationshipStatus(f)]).toLocaleLowerCase(this.i18n.locale().intl);
        return { id: other, label: `${this.i18n.name(index.person(other))} (${status})` };
      });
  });

  readonly partnerChoice = computed(() => (this.settings().partnerId === null ? '' : (this.poster()?.partnerId ?? '')));

  /** How many generations there are above and below the couple in the whole tree. */
  readonly depth = computed(() => {
    const index = this.store.index();
    const centerId = this.centerId();
    const partnerId = this.poster()?.partnerId;
    const roots = [centerId, partnerId].filter((x): x is string => !!x);
    // A former partner's side goes no further up than their parents.
    const couple = centerId && partnerId ? index.familyBetween(centerId, partnerId) : undefined;
    const former = !!couple && isBrokenUp(relationshipStatus(couple));
    let up = 0;
    let down = 0;
    for (const r of roots) {
      for (const [, info] of bloodRelatives(index, r)) {
        if (info.down === 0 && !(former && r === partnerId && info.up > 1)) up = Math.max(up, info.up);
        if (info.up === 0) down = Math.max(down, info.down);
      }
    }
    return { up, down };
  });

  /** How many people each step of the Relatives setting puts on the page, with the generations chosen. */
  readonly relativesCounts = computed<Readonly<Record<Relatives, number>> | null>(() => {
    const p = this.poster();
    if (!p?.centerId) return null;
    const s = this.settings();
    const around = { centerId: p.centerId, partnerId: p.partnerId, ancestors: s.ancestors, descendants: s.descendants, nearFormerPartner: true };
    const counts = {} as Record<Relatives, number>;
    for (const r of RELATIVES) counts[r] = scopeDocument(this.store.doc(), this.store.index(), { ...around, ...relativesSettings(r) }).people.size;
    return counts;
  });

  /** "A3 landscape, 420 × 297 mm. 29 people." */
  readonly summary = computed(() => {
    const p = this.poster();
    if (!p) return '';
    const t = this.i18n.t;
    const size = p.paper
      ? t('print.size.paper', {
          paper: this.paperLabel(),
          orientation: t(p.paper.landscape ? 'print.orientation.landscape' : 'print.orientation.portrait').toLocaleLowerCase(this.i18n.locale().intl),
          w: Math.round(p.paper.widthMm),
          h: Math.round(p.paper.heightMm),
        })
      : t('print.size.px', { w: Math.round(p.width), h: Math.round(p.height) });
    const people = p.people === p.total ? t('print.people.all', { count: p.people }) : t('print.people.some', { shown: p.people, total: p.total });
    return `${size}. ${people}.`;
  });

  /** The sheets the PDF comes out on when it is printed in pieces (see PrintSettings.tiles), or null for one. */
  readonly tiles = computed<TileGrid | null>(() => {
    const p = this.poster();
    const sheet = this.settings().tiles;
    if (!p || !sheet) return null;
    const mm = this.posterMm(p);
    return tileGrid(mm.w, mm.h, sheet, !!this.settings().tilesBorderless);
  });

  /** "The PDF comes out on 4 sheets of A3 landscape (2 × 2)…", or nothing when it is one sheet. */
  readonly tilesNote = computed(() => {
    const g = this.tiles();
    if (!g) return '';
    const t = this.i18n.t;
    const mm = this.posterMm(this.poster()!);
    const sheets = t('print.tiles.sheets', {
      count: g.tiles.length,
      sheet: g.sheet.label,
      orientation: t(g.landscape ? 'print.orientation.landscape' : 'print.orientation.portrait').toLocaleLowerCase(this.i18n.locale().intl),
      cols: g.cols,
      rows: g.rows,
    });
    const size = { w: Math.round(mm.w * g.scale), h: Math.round(mm.h * g.scale), percent: Math.round(g.scale * 100), overlap: g.overlap };
    const result = g.scale > 0.995 ? t('print.tiles.full', size) : g.margin ? t('print.tiles.smaller', size) : t('print.tiles.smallerOverlap', size);
    return `${sheets} ${result} ${t('print.tiles.glue', size)}`;
  });

  private posterMm(p: Pick<PosterResult, 'paper' | 'width' | 'height'>): { w: number; h: number } {
    return p.paper ? { w: p.paper.widthMm, h: p.paper.heightMm } : { w: p.width / PX_PER_MM, h: p.height / PX_PER_MM };
  }

  /**
   * How big the names come out on paper, with a warning when they are too small to read, or the cards
   * narrower than the paper wants (minCardMm), with the paper they would need.
   */
  readonly sizeNote = computed(() => {
    const p = this.poster();
    if (!p?.paper) return null;
    const pt = Math.round(p.namePt * 10) / 10;
    const card = { w: Math.round(p.cardMm.w), h: Math.round(p.cardMm.h) };
    if (pt < 6) return { warn: true, text: this.i18n.t('print.nameSizeSmall', { pt, ...card }) };
    const min = minCardMm(Math.min(p.paper.widthMm, p.paper.heightMm), p.cardUnits.w);
    if (p.cardMm.w < min * 0.99) {
      const paper = paperFor(p.paper.widthMm, p.paper.heightMm, p.cardMm.w, p.cardUnits.w);
      return { warn: true, text: this.i18n.t('print.cardSmall', { pt, ...card, min, paper: paper?.label ?? this.i18n.t('print.paperBeyond') }) };
    }
    return { warn: false, text: this.i18n.t('print.nameSize', { pt, ...card }) };
  });

  /** What the page of settings after the print says: the settings in words, with where the title and the names stand in centimetres. */
  readonly settingsSheet = computed<SettingsSheet | null>(() => {
    const p = this.poster();
    if (!p) return null;
    const s = this.settings();
    const t = this.i18n.t;
    const on = (v: boolean) => t(v ? 'print.sp.on' : 'print.sp.off');
    const cm = (v: number) => `${Math.round(v * 100) / 100} cm`;
    const reach = (r: Reach) => (r === 'all' ? t('print.all') : String(r));
    const boxes = this.boxCm();
    const at = (b?: { x: number; y: number }) => (b ? `${cm(b.x)} / ${cm(b.y)}` : t('print.sp.auto'));
    const size = (v: number | undefined, auto: number) => `${cm(v ?? auto)}${v ? '' : ' (' + t('print.sizeAuto') + ')'}`;
    const person = (id?: string) => (id ? this.nameOf(id) : t('print.nobody'));
    const orient = t(p.paper?.landscape ? 'print.orientation.landscape' : 'print.orientation.portrait');
    const row = (key: string, value: string): [string, string] => [t(key as MessageKey), value];
    return {
      title: t('print.sp.title'),
      subtitle: `${this.settings().title?.trim() || this.store.doc().meta.title} \u00b7 ${t('print.sp.subtitle')}`,
      sections: [
        {
          heading: t('print.sp.page'),
          rows: [
            row('print.sp.paper', p.paper ? `${this.paperLabel()}, ${orient}` : t('print.sp.fit')),
            row(
              'print.sp.size',
              p.paper ? `${Math.round(p.paper.widthMm)} \u00d7 ${Math.round(p.paper.heightMm)} mm` : `${Math.round(p.width)} \u00d7 ${Math.round(p.height)} px`,
            ),
            row('print.sp.tiles', s.tiles ? `${s.tiles}${s.tilesBorderless ? ' (' + t('print.sp.borderless') + ')' : ''}` : t('print.sp.off')),
            row('print.sp.card', `${Math.round(p.cardMm.w)} \u00d7 ${Math.round(p.cardMm.h)} mm, ${Math.round(p.namePt * 10) / 10} pt`),
          ],
        },
        {
          heading: t('print.sp.middle'),
          rows: [row('print.sp.person', person(p.centerId)), row('print.sp.partner', person(p.partnerId)), row('print.sp.people', `${p.people} / ${p.total}`)],
        },
        {
          heading: t('print.sp.reach'),
          rows: [
            row('print.sp.up', reach(s.ancestors)),
            row('print.sp.down', reach(s.descendants)),
            row('print.sp.branches', reach(s.branches)),
            row('print.sp.inLaws', on(s.inLawFamilies)),
            row('print.sp.siblingsOnly', on(s.siblingsOnly)),
            row('print.sp.hidden', on(s.showHidden)),
          ],
        },
        {
          heading: t('print.sp.arrange'),
          rows: [
            row('print.sp.tight', on(s.tight)),
            row('print.cardGap', s.cardGap !== undefined ? `${s.cardGap} %` : t('print.sizeAuto')),
            row('print.lineGap', s.lineGap !== undefined ? `${s.lineGap} %` : t('print.sizeAuto')),
            row('print.sp.fill', on(s.fill)),
            row('print.sp.stack', on(s.stackCouples)),
            row('print.sp.amid', on(s.amidPartners)),
            row('print.sp.layout', String((s.layoutChoice ?? 0) + 1)),
          ],
        },
        {
          heading: t('print.sp.cards'),
          rows: [
            row('print.sp.largeText', on(s.largeText)),
            row('print.sp.strong', on(s.strongLines)),
            row('print.sp.freeWidths', on(s.freeWidths)),
            row('print.sp.unionText', on(s.unionText)),
            row('print.sp.dates', t(`print.sp.dates.${s.dates}` as MessageKey)),
            row('print.sp.emblems', on(s.showEmblems)),
            row('print.sp.birthNames', on(s.showBirthNames)),
            row('print.sp.ribbons', on(s.showRibbons)),
            row('print.sp.sexColors', on(s.sexColors)),
            row('print.sp.frame', on(s.showFrame)),
          ],
        },
        {
          heading: t('print.sp.titleSec'),
          rows: [
            row('print.sp.shown', on(s.showTitle)),
            row('print.sp.text', s.title?.trim() || this.store.doc().meta.title),
            row('print.sp.size.title', size(s.titleSize, p.lettering.autoTitleCm)),
            row('print.sp.position', at(boxes?.title)),
          ],
        },
        {
          heading: t('print.sp.namesSec'),
          rows: [
            row('print.sp.shown', on(s.showLegend)),
            row('print.sp.heading', on(s.legendHeading)),
            ...(s.legendHeading ? [row('print.sp.headAlign', t(`print.headAlign.${s.legendHeadAlign ?? 'center'}` as MessageKey))] : []),
            ...(s.legendHeading ? [row('print.sp.headWidth', s.legendHeadWidth ? `${s.legendHeadWidth} cm` : t('print.sizeAuto'))] : []),
            row('print.sp.blocks', on(s.legendBlocks)),
            row('print.sp.size.names', size(s.legendSize, p.lettering.autoLegendCm)),
            row('print.sp.position', at(boxes?.legend)),
          ],
        },
        {
          heading: t('print.sp.hand'),
          rows: [
            row('print.sp.bent', String(Object.keys(s.lineBends ?? {}).length)),
            row('print.sp.moved', String(Object.keys(s.moves ?? {}).length)),
            row('print.sp.gaps', String(Object.keys(s.gaps ?? {}).length)),
            row('print.sp.added', String(s.added?.length ?? 0)),
            row('print.sp.flipped', String(s.flipped?.length ?? 0)),
            row('print.sp.omitted', String(this.ui.printOmitted().length)),
          ],
        },
      ],
      footer: t('print.sp.footer', { date: new Date().toLocaleDateString(this.i18n.locale().intl) }),
    };
  });

  /** The page of settings drawn, with its fonts inside it; undefined when it is switched off. */
  private async settingsSvg(): Promise<string | undefined> {
    const sheet = this.settingsSheet();
    if (!sheet || !this.settings().settingsPage) return undefined;
    return this.exporter.withEmbeddedFonts(settingsPageSvg(sheet), settingsText(sheet));
  }

  /** The person the print is drawn around as the settings name them (the home person when they name nobody). */
  private readonly middleId = computed(() => this.settings().centerId ?? this.store.doc().meta.homePersonId ?? '');

  /** The settings as they would be kept: naming the person in the middle and the partner the page shows beside them. */
  private readonly toKeep = computed<PrintSettings>(() => {
    const s = this.settings();
    const partnerId = s.partnerId === null ? null : (s.partnerId ?? this.poster()?.partnerId ?? undefined);
    const keep: PrintSettings = { ...s, centerId: this.middleId(), partnerId };
    if (partnerId === undefined) delete keep.partnerId;
    return keep;
  });

  /** The print settings kept for the person in the middle or their partner, if any (see TreeDocument.savedPrints). */
  readonly saved = computed(() => {
    const doc = this.store.doc();
    const keep = this.toKeep();
    const kept = savedPrintOf(doc, keep.centerId ?? '') ?? (keep.partnerId ? savedPrintOf(doc, keep.partnerId) : undefined);
    return kept ? ({ ...DEFAULT_PRINT, ...kept } as PrintSettings) : undefined;
  });
  /** Who the kept settings are for: the person in the middle, and their partner when the page shows one. */
  readonly savedNames = computed(() => {
    const s = this.saved() ?? this.toKeep();
    return [s.centerId, s.partnerId].filter((id): id is string => !!id).map((id) => this.nameOf(id));
  });
  /** The print as it is now differs from what is kept for the person in the middle. */
  readonly savedDiffers = computed(() => {
    const kept = this.saved();
    return !!kept && !samePrint(kept, this.toKeep());
  });

  /** The print as it is now kept for the person in the middle and their partner, in place of anything kept for them before. */
  saveForMiddle(): void {
    if (!this.middleId()) return;
    const keep = this.toKeep();
    this.store.update((doc) => savePrintFor(doc, keep), 'print save');
  }

  /** What is kept for the person in the middle, forgotten. */
  forgetSaved(): void {
    const id = this.saved()?.centerId;
    if (id) this.store.update((doc) => forgetPrintFor(doc, id), 'print forget');
  }

  /** The print back as it was kept for the person in the middle (and their partner). */
  useSaved(): void {
    const id = this.saved()?.centerId;
    if (!id) return;
    this.store.update((doc) => useSavedPrint(doc, id), 'print use');
    this.ui.printEdited();
  }

  /** Someone else in the middle of the page: with the settings kept for them, when there are any. */
  chooseMiddle(id: string): void {
    if (savedPrintOf(this.store.doc(), id)) {
      this.store.update((doc) => useSavedPrint(doc, id), 'print');
      this.ui.printEdited();
    } else {
      this.set({ centerId: id, partnerId: undefined });
    }
  }

  paperLabel(): string {
    const id = this.settings().paper;
    return PAPERS.find((p) => p.id.toLowerCase() === id.toLowerCase())?.label ?? 'A3';
  }

  set(patch: Partial<PrintSettings>, step = 'print'): void {
    // A setting that lays the tree out anew: cards moved and lines led by hand were for the old layout, and go
    // (in the same step, so undoing the change brings them back).
    const s = this.settings();
    const relayout = (Object.keys(patch) as (keyof PrintSettings)[]).some((k) => RELAYOUT.has(k) && JSON.stringify(patch[k]) !== JSON.stringify(s[k]));
    if (relayout && (s.moves || s.lineBends)) patch = { ...patch, moves: undefined, lineBends: undefined };
    this.store.update((doc) => updatePrint(doc, patch), step);
    this.ui.printEdited();
  }

  /** Waits for the fonts of all print styles, so text is measured with the real letters. */
  async loadFonts(): Promise<void> {
    if (this.fontsReady()) return;
    const faces = new Set(FONTS);
    try {
      await Promise.all([...faces].map((f) => document.fonts?.load(f)));
    } catch {
      // Fallback fonts are measured instead.
    }
    this.fontsReady.set(true);
  }

  close(): void {
    this.staged.set({});
    this.ui.printOpen.set(false);
    this.ui.clearPrintOmitted();
  }

  async output(kind: PrintOutput): Promise<void> {
    const p = this.poster();
    if (!p || this.busy()) return;
    const base = this.settings().title?.trim() || this.store.doc().meta.title;
    if (kind === 'print') {
      // The window must be opened by the click itself, before any waiting, or the browser blocks it.
      const win = window.open('', 'stemma-print');
      this.busy.set(kind);
      try {
        const svg = await this.exporter.withEmbeddedFonts(p.svg, p.text);
        const extra = await this.settingsSvg();
        const words: PrintPageWords = {
          title: this.i18n.t('print.page.title', { title: base }),
          summary: this.summary(),
          hint: this.i18n.t('print.page.hint'),
          print: this.i18n.t('print.print'),
          close: this.i18n.t('common.close'),
          lang: this.i18n.code(),
        };
        if (win) openPrintPage(win, { ...p, svg }, words, extra);
        else printInPlace({ ...p, svg }, extra);
      } catch {
        win?.close();
        this.toast.error(this.i18n.t('print.failed'));
      } finally {
        this.busy.set(null);
      }
      return;
    }
    this.busy.set(kind);
    try {
      const svg = await this.exporter.withEmbeddedFonts(p.svg, p.text);
      if (kind === 'svg') {
        await this.save(safeFilename(base, 'svg'), new Blob([svg], { type: 'image/svg+xml' }), 'image/svg+xml');
        return;
      }
      const size = this.exporter.rasterSize(p.width, p.height, p.paper ? PRINT_DPI : 192);
      const canvas = await this.exporter.rasterize(svg, size.w, size.h, palette.paper);
      if (kind === 'png') {
        await this.save(safeFilename(base, 'png'), await this.exporter.toBlob(canvas, 'image/png'), 'image/png');
      } else {
        const jpeg = new Uint8Array(await (await this.exporter.toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
        const pt = 72 / 96;
        const grid = this.tiles();
        // The page of settings after the print: its own A4 page in the PDF, as a picture of its own.
        const extraSvg = await this.settingsSvg();
        const extras: { jpeg: Uint8Array; w: number; h: number }[] = [];
        const sheetPage = { w: SETTINGS_PAGE.w * pt, h: SETTINGS_PAGE.h * pt, content: '' };
        if (extraSvg) {
          const small = this.exporter.rasterSize(SETTINGS_PAGE.w, SETTINGS_PAGE.h, PRINT_DPI);
          const settingsCanvas = await this.exporter.rasterize(extraSvg, small.w, small.h, palette.paper);
          extras.push({ jpeg: new Uint8Array(await (await this.exporter.toBlob(settingsCanvas, 'image/jpeg', 0.92)).arrayBuffer()), w: small.w, h: small.h });
          sheetPage.content = `q ${sheetPage.w.toFixed(2)} 0 0 ${sheetPage.h.toFixed(2)} 0 0 cm /Im1 Do Q`;
        }
        if (grid) {
          const mm = this.posterMm(p);
          const name = `${base} ${grid.tiles.length}x ${grid.sheet.label}`;
          const pages = [...tilePages(grid, mm.w, mm.h), ...(extraSvg ? [sheetPage] : [])];
          await this.save(safeFilename(name, 'pdf'), pdfPages(jpeg, size.w, size.h, pages, base, extras), 'application/pdf');
        } else if (extraSvg) {
          const first = { w: p.width * pt, h: p.height * pt, content: `q ${(p.width * pt).toFixed(2)} 0 0 ${(p.height * pt).toFixed(2)} 0 0 cm /Im0 Do Q` };
          await this.save(safeFilename(base, 'pdf'), pdfPages(jpeg, size.w, size.h, [first, sheetPage], base, extras), 'application/pdf');
        } else {
          await this.save(safeFilename(base, 'pdf'), pdfFromJpeg(jpeg, size.w, size.h, p.width * pt, p.height * pt, base), 'application/pdf');
        }
      }
    } catch {
      this.toast.error(this.i18n.t('print.failed'));
    } finally {
      this.busy.set(null);
    }
  }

  private async save(filename: string, data: Blob, mime: string): Promise<void> {
    const outcome = await this.files.save(filename, data, mime);
    if (outcome === 'saved') this.toast.show(this.i18n.t('file.saved', { name: filename }));
    else if (outcome === 'unsupported') this.toast.error(this.i18n.t('print.unsupported'));
    else if (outcome === 'failed') this.toast.error(this.i18n.t('file.saveFailed'));
  }
}

interface PrintPageWords {
  title: string;
  summary: string;
  hint: string;
  print: string;
  close: string;
  lang: string;
}

/**
 * The page in a window of its own, filling it, ready to print: nothing but
 * the drawn page (with its fonts inside it, so the window needs nothing from
 * the app), a small bar with Print and Close that is not printed, and the
 * paper size set, so the browser's print dialog gets the page as it is. The
 * dialog opens by itself once the fonts are in.
 */
function openPrintPage(win: Window, p: Pick<PosterResult, 'svg' | 'width' | 'height' | 'paper'>, words: PrintPageWords, extra?: string): void {
  const w = p.paper ? p.paper.widthMm : p.width / PX_PER_MM;
  const h = p.paper ? p.paper.heightMm : p.height / PX_PER_MM;
  const ratio = p.width / p.height;
  const css =
    `@page { size: ${w.toFixed(1)}mm ${h.toFixed(1)}mm; margin: 0; }` +
    `html, body { margin: 0; min-height: 100%; background: #42464d; font: 14px/1.4 system-ui, 'Segoe UI', sans-serif; color: #e8eaee; }` +
    `.bar { position: fixed; inset: 0 0 auto 0; height: 50px; display: flex; align-items: center; gap: 14px; padding: 0 18px; background: #1d1f23; box-shadow: 0 1px 6px rgba(0,0,0,.4); z-index: 2; }` +
    `.bar strong { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` +
    `.bar .sum { color: #aab0b9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` +
    `.bar .hint { color: #8d939c; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }` +
    `.bar button { font: inherit; padding: 7px 16px; border-radius: 6px; border: 1px solid #5a6069; background: #2b2e34; color: #fff; cursor: pointer; }` +
    `.bar button.primary { background: #2f6fdb; border-color: #2f6fdb; }` +
    `.bar button:hover { filter: brightness(1.15); }` +
    `.stage { padding: 74px 24px 24px; display: flex; justify-content: center; align-items: flex-start; }` +
    `.sheet { width: min(100vw - 48px, calc((100vh - 98px) * ${ratio.toFixed(4)})); background: ${palette.paper}; box-shadow: 0 10px 40px rgba(0,0,0,.5); }` +
    `.sheet svg { display: block; width: 100%; height: auto; }` +
    `.stage { flex-direction: column; align-items: center; gap: 24px; }` +
    `.sheet.settings { width: min(100vw - 48px, calc((100vh - 98px) * 0.7071)); }` +
    `@page settings { size: 210mm 297mm; margin: 0; }` +
    `@media print { html, body { background: none; min-height: 0; } .bar { display: none; } .stage { padding: 0; display: block; }` +
    ` .sheet { width: ${w.toFixed(1)}mm; height: ${h.toFixed(1)}mm; box-shadow: none; } .sheet svg { width: ${w.toFixed(1)}mm; height: ${h.toFixed(1)}mm; }` +
    ` .sheet.settings { page: settings; break-before: page; width: 210mm; height: 297mm; } .sheet.settings svg { width: 210mm; height: 297mm; } }`;
  const doc = win.document;
  doc.open();
  doc.write(
    `<!doctype html><html lang="${escapeText(words.lang)}"><head><meta charset="utf-8"><title>${escapeText(words.title)}</title><style>${css}</style></head><body>` +
      `<div class="bar"><strong>${escapeText(words.title)}</strong><span class="sum">${escapeText(words.summary)}</span><span class="hint">${escapeText(words.hint)}</span>` +
      `<button type="button" class="primary" id="print">${escapeText(words.print)}</button><button type="button" id="close">${escapeText(words.close)}</button></div>` +
      `<div class="stage"><div class="sheet">${p.svg}</div>${extra ? `<div class="sheet settings">${extra}</div>` : ''}</div></body></html>`,
  );
  doc.close();
  doc.getElementById('print')?.addEventListener('click', () => win.print());
  doc.getElementById('close')?.addEventListener('click', () => win.close());
  win.focus();
  // The print dialog once the fonts in the page are ready; the window stays for another go or to look at the page.
  const ready = doc.fonts?.ready ?? Promise.resolve();
  ready.then(() => setTimeout(() => win.print(), 200));
}

/** Prints from the app's own window when the browser would not open another: only the page is printed, at its paper size. */
function printInPlace(p: Pick<PosterResult, 'svg' | 'width' | 'height' | 'paper'>, extra?: string): void {
  const w = p.paper ? p.paper.widthMm : p.width / PX_PER_MM;
  const h = p.paper ? p.paper.heightMm : p.height / PX_PER_MM;
  const style = document.createElement('style');
  style.textContent =
    `@page { size: ${w.toFixed(1)}mm ${h.toFixed(1)}mm; margin: 0; }` +
    `.stemma-print { display: none; }` +
    `@media print { html, body { height: auto !important; overflow: visible !important; background: none !important; }` +
    ` body > *:not(.stemma-print) { display: none !important; }` +
    ` .stemma-print { display: block !important; } .stemma-print svg { display: block; width: ${w.toFixed(1)}mm; height: ${h.toFixed(1)}mm; }` +
    ` .stemma-print .settings { page: settings; break-before: page; } .stemma-print .settings svg { width: 210mm; height: 297mm; } }` +
    `@page settings { size: 210mm 297mm; margin: 0; }`;
  const holder = document.createElement('div');
  holder.className = 'stemma-print';
  holder.innerHTML = p.svg + (extra ? `<div class="settings">${extra}</div>` : '');
  document.head.append(style);
  document.body.append(holder);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    style.remove();
    holder.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 60_000);
}

/** A box so big at an anchor of the page inside its margin (`inner`), all as shares of the page. */
function placeIn(inner: LegendBox, at: Anchor, w: number, h: number): LegendBox {
  const to = anchorShares(at);
  return { x: inner.x + to.x * (inner.w - w), y: inner.y + to.y * (inner.h - h), w, h };
}
