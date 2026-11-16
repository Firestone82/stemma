import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Orientation } from '../../../core/model/types';
import { FIT_PAPER, PAPERS, PX_PER_MM } from '../../../core/poster/paper';
import { I18n } from '../../../i18n/i18n';
import { SegmentOption, Segmented } from '../../../shared/segmented/segmented';
import { Switch } from '../../../shared/switch/switch';
import { PrintModel } from '../print-model';

/** The paper: its size, which way round it is, and the smaller sheets it is printed on in pieces. */
@Component({
  selector: 'stemma-paper-options',
  imports: [Segmented, Switch],
  templateUrl: './paper-options.html',
  styleUrl: './paper-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'studio-group', role: 'group', 'aria-labelledby': 'print-g-paper' },
})
export class PaperOptions {
  protected readonly model = inject(PrintModel);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly papers = PAPERS;
  protected readonly fitPaper = FIT_PAPER;
  protected readonly fit = computed(() => this.model.settings().paper === FIT_PAPER);

  /** Papers smaller than the page, to print it on in pieces. */
  protected readonly sheets = computed(() => {
    const p = this.model.poster();
    if (!p) return [];
    const w = p.paper ? p.paper.widthMm : p.width / PX_PER_MM;
    const h = p.paper ? p.paper.heightMm : p.height / PX_PER_MM;
    return PAPERS.filter((s) => s.widthMm * s.heightMm < w * h * 0.95);
  });

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
}
