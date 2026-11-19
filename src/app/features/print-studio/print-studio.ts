import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { Icon } from '../../shared/icon/icon';
import { Scroll } from '../../shared/scroll/scroll';
import { HistoryButtons } from '../top-bar/history-buttons/history-buttons';
import { CardOptions } from './card-options/card-options';
import { CentreOptions } from './centre-options/centre-options';
import { NamesOptions } from './names-options/names-options';
import { OutputActions } from './output-actions/output-actions';
import { PaperOptions } from './paper-options/paper-options';
import { Addable } from '../../core/poster/scope';
import { MessageKey } from '../../i18n/locales';
import { PrintModel } from './print-model';
import { BoxesPlaced, PrintPreview, placedSettings } from './print-preview/print-preview';
import { PreviewWindow } from './preview-window/preview-window';
import { ReachOptions } from './reach-options/reach-options';
import { TitleOptions } from './title-options/title-options';

/** The settings are never narrower than this. */
const MIN_CONTROLS = 550;
/** Around the page in the preview: its padding left and right, and above and below with the gap and the summary line under it. */
const PREVIEW_PAD_X = 56;
const PREVIEW_PAD_Y = 24 + 14 + 12 + 22;
/** About how big a card's menu is, to keep it on the screen. */
const MENU_W = 280;
const MENU_H = 400;

/**
 * Print and export, as a page of its own (at #/print, see PrintRoute) in
 * place of the chart: the page as large as the window's height allows on the
 * left, and on the right, taking all the width the page does not need, the
 * print style, who is in the middle, how far the tree reaches, what the cards
 * show and the paper; Print and the files in the bar at the top. The page can
 * have a window of its own (PreviewWindow); the settings then take the whole
 * width.
 */
@Component({
  selector: 'stemma-print-studio',
  imports: [Scroll, Icon, HistoryButtons, PrintPreview, CentreOptions, ReachOptions, CardOptions, PaperOptions, TitleOptions, NamesOptions, OutputActions],
  templateUrl: './print-studio.html',
  styleUrl: './print-studio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()', '(document:pointerdown)': 'onPointerDown($event)' },
})
export class PrintStudio {
  protected readonly model = inject(PrintModel);
  protected readonly preview = inject(PreviewWindow);
  protected readonly t = inject(I18n).t;

  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly previewPane = viewChild(PrintPreview);
  private readonly bodySize = signal({ width: 0, height: 0 });

  /** How wide the page's column is: as wide as the page is at the full height, leaving the settings the rest. */
  protected readonly previewWidth = computed(() => {
    const { width, height } = this.bodySize();
    const p = this.model.poster();
    if (!width || !height) return undefined;
    const ratio = p?.width && p.height ? p.width / p.height : 1.414;
    const ideal = Math.max(0, height - PREVIEW_PAD_Y) * ratio + PREVIEW_PAD_X;
    return Math.round(Math.max(0, Math.min(width - MIN_CONTROLS, ideal)));
  });

  constructor() {
    effect(() => untracked(() => this.model.loadFonts()));
    effect((onCleanup) => {
      const el = this.body().nativeElement;
      const observer = new ResizeObserver(([entry]) => {
        const box = entry.contentRect;
        this.bodySize.set({ width: box.width, height: box.height });
      });
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });
  }

  /** Escape leaves the page, unless a dialog is open over it; zoomed into the preview, it first goes back to the whole page. */
  /** The menu of a card in the page (right click): who it is, bringing their family onto the print, and leaving them out. */
  protected readonly menu = signal<{ id: string; name: string; x: number; y: number } | null>(null);
  /** The menu of the families' names' box in the page (right click): where it stands. */
  protected readonly boxMenu = signal<{ x: number; y: number } | null>(null);

  protected openBoxMenu(at: { x: number; y: number }): void {
    this.menu.set(null);
    this.boxMenu.set({ x: Math.max(8, Math.min(at.x, window.innerWidth - MENU_W - 8)), y: Math.max(8, Math.min(at.y, window.innerHeight - 120)) });
  }

  /** The names' box as small as what is in it. */
  protected fitNamesBox(): void {
    this.boxMenu.set(null);
    this.previewPane()?.fitNamesBox();
  }

  /** The names keep a place of their own that no card stands on, or give it up to the cards. */
  protected toggleNamesBlock(): void {
    this.boxMenu.set(null);
    this.model.set({ legendBlocks: !this.model.settings().legendBlocks });
  }

  /** The names' box back where the page puts it by itself. */
  protected resetNamesBox(): void {
    this.boxMenu.set(null);
    this.model.stage({ legendBox: undefined, legendAnchor: undefined });
  }

  protected openMenu(at: { personId: string; x: number; y: number }): void {
    this.boxMenu.set(null);
    this.menu.set({
      id: at.personId,
      name: this.model.nameOf(at.personId),
      // Kept on the screen.
      x: Math.max(8, Math.min(at.x, window.innerWidth - MENU_W - 8)),
      y: Math.max(8, Math.min(at.y, window.innerHeight - MENU_H - 8)),
    });
  }

  /** The title or the families' names placed by hand in the page (or put back): waiting, with the other changes that wait, until applied. */
  protected placeBoxes(placed: BoxesPlaced): void {
    this.model.stage(placedSettings(placed));
  }

  /** How the names are drawn into a box being changed: as they will be once what waits is applied. */
  protected readonly namesStyle = computed(() => {
    const v = this.model.view();
    const p = this.model.poster();
    // A size typed in is that size; otherwise in a box sized by hand as big as the box lets them be, elsewhere as the page sizes them.
    return { align: v.legendAlign ?? 'center', cm: v.legendSize ?? (v.legendBox ? null : (p?.lettering.autoLegendCm ?? null)) } as const;
  });

  /** Whether the menu's card has been moved by hand. */
  protected readonly menuMoved = computed(() => {
    const m = this.menu();
    return !!m && !!this.model.settings().moves?.[m.id];
  });

  /** Who each of the menu's choices would bring onto the print, with how many; none when it would bring nobody. */
  protected readonly menuAdd = computed(() => {
    const m = this.menu();
    if (!m) return [];
    const ids = this.model.addable(m.id);
    const labels: Record<Addable, MessageKey> = { parents: 'print.menu.addParents', siblings: 'print.menu.addSiblings', family: 'print.menu.addFamily' };
    // A choice that brings no more than the one before it is left out.
    const seen = new Set<string>();
    return (['parents', 'siblings', 'family'] as const)
      .map((what) => {
        const count = ids[what].length;
        const more = ids[what].some((id) => !seen.has(id));
        for (const id of ids[what]) seen.add(id);
        return { what, label: labels[what], count, more };
      })
      .filter((c) => c.count > 0 && c.more);
  });

  protected add(what: Addable): void {
    const m = this.menu();
    this.menu.set(null);
    if (m) this.model.add(m.id, what);
  }

  protected flip(): void {
    const m = this.menu();
    this.menu.set(null);
    if (m) this.model.flip(m.id);
  }

  protected unmove(): void {
    const m = this.menu();
    this.menu.set(null);
    if (m) this.model.unmove(m.id);
  }

  /** A press anywhere but in a card's menu closes it. */
  protected onPointerDown(event: PointerEvent): void {
    if (!(event.target as Element | null)?.closest('.card-menu')) {
      if (this.menu()) this.menu.set(null);
      if (this.boxMenu()) this.boxMenu.set(null);
    }
  }

  protected hide(personId: string): void {
    this.menu.set(null);
    this.model.omit(personId);
  }

  protected onEscape(): void {
    if (this.menu() || this.boxMenu()) {
      this.menu.set(null);
      this.boxMenu.set(null);
      return;
    }
    if (document.querySelector('dialog[open]')) return;
    const preview = this.previewPane();
    // What waits to be applied is forgotten first; then the closer look; then the studio.
    if (this.model.discardStaged()) return;
    if (preview?.zoomedIn()) preview.resetZoom();
    else this.model.close();
  }
}
