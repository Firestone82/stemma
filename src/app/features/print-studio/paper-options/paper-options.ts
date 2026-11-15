import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Orientation } from '../../../core/model/types';
import { FIT_PAPER, PAPERS, PX_PER_MM } from '../../../core/poster/paper';
import { TreeStore } from '../../../core/store/tree-store';
import { I18n } from '../../../i18n/i18n';
import { SegmentOption, Segmented } from '../../../shared/segmented/segmented';
import { Switch } from '../../../shared/switch/switch';
import { PrintModel } from '../print-model';

/** The paper size and orientation, and the title on the page. */
@Component({
  selector: 'stemma-paper-options',
  imports: [Segmented, Switch],
  templateUrl: './paper-options.html',
  styleUrl: './paper-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'studio-group', role: 'group', 'aria-labelledby': 'print-g-paper' },
})
export class PaperOptions {
  private readonly store = inject(TreeStore);
  protected readonly model = inject(PrintModel);
  protected readonly t = inject(I18n).t;

  protected readonly papers = PAPERS;
  protected readonly fitPaper = FIT_PAPER;
  protected readonly treeTitle = computed(() => this.store.doc().meta.title);
  protected readonly fit = computed(() => this.model.settings().paper === FIT_PAPER);

  /** Papers smaller than the page, to print it on in pieces. */
  protected readonly sheets = computed(() => {
    const p = this.model.poster();
    if (!p) return [];
    const w = p.paper ? p.paper.widthMm : p.width / PX_PER_MM;
    const h = p.paper ? p.paper.heightMm : p.height / PX_PER_MM;
    return PAPERS.filter((s) => s.widthMm * s.heightMm < w * h * 0.95);
  });

  /** The title's and the families' names' size, in per cent of what fits the cards (see PrintSettings.titleScale). */
  protected readonly sizes = computed(() => {
    const s = this.model.settings();
    return [
      { key: 'titleScale' as const, label: 'print.titleSize' as const, percent: Math.round((s.titleScale ?? 1) * 100) },
      { key: 'legendScale' as const, label: 'print.legendSize' as const, percent: Math.round((s.legendScale ?? 1) * 100) },
    ];
  });

  protected setSize(key: 'titleScale' | 'legendScale', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value) / 100;
    this.model.set({ [key]: Math.abs(value - 1) < 0.001 ? undefined : value });
  }

  protected setTiles(event: Event): void {
    this.model.set({ tiles: (event.target as HTMLSelectElement).value || undefined });
  }

  protected readonly orientations = computed<SegmentOption<Orientation>[]>(() => [
    { value: 'auto', label: this.t('print.orientation.auto') },
    { value: 'portrait', label: this.t('print.orientation.portrait') },
    { value: 'landscape', label: this.t('print.orientation.landscape') },
  ]);

  protected isPaper(id: string): boolean {
    return this.model.settings().paper.toLowerCase() === id.toLowerCase();
  }

  protected setPaper(event: Event): void {
    this.model.set({ paper: (event.target as HTMLSelectElement).value });
  }

  protected setText(key: 'title' | 'subtitle', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.model.set({ [key]: value.trim() ? value : undefined });
  }
}
