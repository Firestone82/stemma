import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { bloodRelatives } from '../../core/kinship/kinship';
import { updatePrint } from '../../core/model/operations';
import { isBrokenUp, relationshipStatus } from '../../core/model/relationship';
import { DEFAULT_PRINT, PrintSettings, effectivePrint } from '../../core/model/types';
import { PAPERS, PX_PER_MM } from '../../core/poster/paper';
import { escapeText } from '../../core/xml/xml-writer';
import { pdfFromJpeg } from '../../core/poster/pdf';
import { PosterResult, renderPoster } from '../../core/poster/poster';
import { RELATIVES, Relatives, relativesSettings, scopeDocument } from '../../core/poster/scope';
import { POSTER_THEMES } from '../../core/poster/themes';
import { FileIo, safeFilename } from '../../core/services/file-io';
import { ImageExporter } from '../../core/services/image-export';
import { TextMeasurer } from '../../core/services/text-measure';
import { ToastService } from '../../core/services/toast';
import { TreeStore } from '../../core/store/tree-store';
import { I18n } from '../../i18n/i18n';
import { STATUS_LABEL } from '../../i18n/labels';
import { UiState } from '../../state/ui-state';

export type PrintOutput = 'print' | 'pdf' | 'png' | 'svg';

/** Resolution for PNG and PDF files of paper sizes. */
const PRINT_DPI = 200;

/**
 * The print studio's state and work: the page drawn from the print settings,
 * the choices offered, and making the files. Settings are saved with the tree.
 */
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

  /** The page, drawn only while the studio is open and the fonts can be measured. */
  readonly poster = computed<PosterResult | null>(() => {
    if (!this.ui.printOpen() || !this.fontsReady()) return null;
    this.measure.fontsVersion();
    const doc = this.store.doc();
    if (!doc.people.length) return null;
    // The words on the page are in the app's language.
    return renderPoster({
      doc,
      settings: this.settings(),
      language: this.i18n.code(),
      measure: (t, f) => this.measure.width(t, f),
      omit: new Set(this.ui.printOmitted()),
    });
  });

  /** How many people were clicked away from this print. */
  readonly omittedCount = computed(() => this.ui.printOmitted().length);

  constructor() {
    // Another tree: nobody is left out of its prints yet.
    effect(() => {
      this.store.loadId();
      untracked(() => this.ui.printOmitted.set([]));
    });
  }

  /** Leaves a person out of this print (a click on their card); the person in the middle stays. */
  omit(personId: string): void {
    if (personId === this.centerId() || this.ui.printOmitted().includes(personId)) return;
    this.ui.printOmitted.update((ids) => [...ids, personId]);
  }

  /** Brings everyone clicked away back. */
  restoreOmitted(): void {
    this.ui.printOmitted.set([]);
  }

  readonly themeId = computed(() => this.poster()?.theme.id ?? this.settings().theme);

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

  /** How big the names come out on paper, with a warning when they are too small to read. */
  readonly sizeNote = computed(() => {
    const p = this.poster();
    if (!p?.paper) return null;
    const pt = Math.round(p.namePt * 10) / 10;
    return pt < 6 ? { warn: true, text: this.i18n.t('print.nameSizeSmall', { pt }) } : { warn: false, text: this.i18n.t('print.nameSize', { pt }) };
  });

  paperLabel(): string {
    const id = this.settings().paper;
    return PAPERS.find((p) => p.id.toLowerCase() === id.toLowerCase())?.label ?? 'A3';
  }

  set(patch: Partial<PrintSettings>): void {
    this.store.update((doc) => updatePrint(doc, patch), 'print');
  }

  /** Waits for the fonts of all print styles, so text is measured with the real letters. */
  async loadFonts(): Promise<void> {
    if (this.fontsReady()) return;
    const faces = new Set(POSTER_THEMES.flatMap((t) => t.fonts));
    try {
      await Promise.all([...faces].map((f) => document.fonts?.load(f)));
    } catch {
      // Fallback fonts are measured instead.
    }
    this.fontsReady.set(true);
  }

  close(): void {
    this.ui.printOpen.set(false);
    this.ui.printOmitted.set([]);
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
        const words: PrintPageWords = {
          title: this.i18n.t('print.page.title', { title: base }),
          summary: this.summary(),
          hint: this.i18n.t('print.page.hint'),
          print: this.i18n.t('print.print'),
          close: this.i18n.t('common.close'),
          lang: this.i18n.code(),
        };
        if (win) openPrintPage(win, { ...p, svg }, words);
        else printInPlace({ ...p, svg });
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
      const canvas = await this.exporter.rasterize(svg, size.w, size.h, p.theme.palette.paper);
      if (kind === 'png') {
        await this.save(safeFilename(base, 'png'), await this.exporter.toBlob(canvas, 'image/png'), 'image/png');
      } else {
        const jpeg = new Uint8Array(await (await this.exporter.toBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
        const pt = 72 / 96;
        await this.save(safeFilename(base, 'pdf'), pdfFromJpeg(jpeg, size.w, size.h, p.width * pt, p.height * pt, base), 'application/pdf');
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
function openPrintPage(win: Window, p: Pick<PosterResult, 'svg' | 'width' | 'height' | 'paper' | 'theme'>, words: PrintPageWords): void {
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
    `.sheet { width: min(100vw - 48px, calc((100vh - 98px) * ${ratio.toFixed(4)})); background: ${p.theme.palette.paper}; box-shadow: 0 10px 40px rgba(0,0,0,.5); }` +
    `.sheet svg { display: block; width: 100%; height: auto; }` +
    `@media print { html, body { background: none; min-height: 0; } .bar { display: none; } .stage { padding: 0; display: block; }` +
    ` .sheet { width: ${w.toFixed(1)}mm; height: ${h.toFixed(1)}mm; box-shadow: none; } .sheet svg { width: ${w.toFixed(1)}mm; height: ${h.toFixed(1)}mm; } }`;
  const doc = win.document;
  doc.open();
  doc.write(
    `<!doctype html><html lang="${escapeText(words.lang)}"><head><meta charset="utf-8"><title>${escapeText(words.title)}</title><style>${css}</style></head><body>` +
      `<div class="bar"><strong>${escapeText(words.title)}</strong><span class="sum">${escapeText(words.summary)}</span><span class="hint">${escapeText(words.hint)}</span>` +
      `<button type="button" class="primary" id="print">${escapeText(words.print)}</button><button type="button" id="close">${escapeText(words.close)}</button></div>` +
      `<div class="stage"><div class="sheet">${p.svg}</div></div></body></html>`,
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
function printInPlace(p: Pick<PosterResult, 'svg' | 'width' | 'height' | 'paper'>): void {
  const w = p.paper ? p.paper.widthMm : p.width / PX_PER_MM;
  const h = p.paper ? p.paper.heightMm : p.height / PX_PER_MM;
  const style = document.createElement('style');
  style.textContent =
    `@page { size: ${w.toFixed(1)}mm ${h.toFixed(1)}mm; margin: 0; }` +
    `.stemma-print { display: none; }` +
    `@media print { html, body { height: auto !important; overflow: visible !important; background: none !important; }` +
    ` body > *:not(.stemma-print) { display: none !important; }` +
    ` .stemma-print { display: block !important; } .stemma-print svg { display: block; width: ${w.toFixed(1)}mm; height: ${h.toFixed(1)}mm; } }`;
  const holder = document.createElement('div');
  holder.className = 'stemma-print';
  holder.innerHTML = p.svg;
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
