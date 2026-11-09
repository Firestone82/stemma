import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { Icon } from '../../shared/icon/icon';
import { CardOptions } from './card-options/card-options';
import { CentreOptions } from './centre-options/centre-options';
import { OutputActions } from './output-actions/output-actions';
import { PaperOptions } from './paper-options/paper-options';
import { PrintModel } from './print-model';
import { PrintPreview } from './print-preview/print-preview';
import { PreviewWindow } from './preview-window/preview-window';
import { ReachOptions } from './reach-options/reach-options';
import { StylePicker } from './style-picker/style-picker';

/** The settings are never narrower than this. */
const MIN_CONTROLS = 550;
/** Around the page in the preview: its padding left and right, and above and below with the gap and the summary line under it. */
const PREVIEW_PAD_X = 56;
const PREVIEW_PAD_Y = 24 + 14 + 12 + 22;

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
  imports: [Icon, PrintPreview, StylePicker, CentreOptions, ReachOptions, CardOptions, PaperOptions, OutputActions],
  templateUrl: './print-studio.html',
  styleUrl: './print-studio.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class PrintStudio {
  protected readonly model = inject(PrintModel);
  protected readonly preview = inject(PreviewWindow);
  protected readonly t = inject(I18n).t;

  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
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

  /** Escape leaves the page, unless a dialog is open over it. */
  protected onEscape(): void {
    if (!document.querySelector('dialog[open]')) this.model.close();
  }
}
