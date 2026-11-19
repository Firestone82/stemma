import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Anchor } from '../../../core/model/types';
import { FIT_PAPER } from '../../../core/poster/paper';
import { TreeStore } from '../../../core/store/tree-store';
import { I18n } from '../../../i18n/i18n';
import { AnchorPicker } from '../../../shared/anchor-picker/anchor-picker';
import { BoxCoords } from '../box-coords/box-coords';
import { LetterSize } from '../letter-size/letter-size';
import { PrintModel } from '../print-model';

/** The title of the page: its words, the line under it, how big it is and where on the page it is held. */
@Component({
  selector: 'stemma-title-options',
  imports: [AnchorPicker, BoxCoords, LetterSize],
  templateUrl: './title-options.html',
  styleUrl: './title-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'studio-group', role: 'group', 'aria-labelledby': 'print-g-title' },
})
export class TitleOptions {
  private readonly store = inject(TreeStore);
  protected readonly model = inject(PrintModel);
  protected readonly t = inject(I18n).t;

  protected readonly treeTitle = computed(() => this.store.doc().meta.title);
  /** A page sized to the tree has its title across the top, always. */
  protected readonly onPaper = computed(() => this.model.settings().paper !== FIT_PAPER);
  /** Where the title is held: the top middle unless another place was picked; nowhere while it lies where it was dragged. */
  protected readonly place = computed<Anchor | null>(() => {
    const s = this.model.view();
    return s.titleAnchor ?? (s.titleAt ? null : 'top');
  });

  protected setText(key: 'title' | 'subtitle', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.model.set({ [key]: value.trim() ? value : undefined });
  }

  /**
   * Held at a place from now on (once applied, with what else waits): wherever it was dragged to is forgotten.
   * The top middle is where it is by itself.
   */
  protected hold(anchor: Anchor): void {
    this.model.stage({ titleAnchor: anchor === 'top' ? undefined : anchor, titleAt: undefined });
  }
}
