import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { PrintModel } from '../print-model';

/** Print, or save the page as PDF (on one sheet or in pieces), PNG or SVG. */
@Component({
  selector: 'stemma-output-actions',
  imports: [Icon],
  templateUrl: './output-actions.html',
  styleUrl: './output-actions.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutputActions {
  protected readonly model = inject(PrintModel);
  protected readonly t = inject(I18n).t;

  /** "PDF", or "PDF 4× A3" when it comes out in pieces. */
  protected readonly pdfLabel = computed(() => {
    const g = this.model.tiles();
    return g ? `PDF ${g.tiles.length}× ${g.sheet.label}` : 'PDF';
  });
}
