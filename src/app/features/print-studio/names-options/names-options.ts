import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Anchor, LEGEND_GAP_CM, LEGEND_GAP_MAX, anchorShares } from '../../../core/model/types';
import { FIT_PAPER } from '../../../core/poster/paper';
import { I18n } from '../../../i18n/i18n';
import { AnchorPicker } from '../../../shared/anchor-picker/anchor-picker';
import { BoxCoords } from '../box-coords/box-coords';
import { LetterSize } from '../letter-size/letter-size';
import { Switch } from '../../../shared/switch/switch';
import { PrintModel } from '../print-model';

/**
 * The families' names on the page: how big they are, where on the page they are held (or left to the page),
 * and where they stand in a box that was made bigger than they need.
 */
@Component({
  selector: 'stemma-names-options',
  imports: [AnchorPicker, BoxCoords, LetterSize, Switch],
  templateUrl: './names-options.html',
  styleUrl: './names-options.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'studio-group', role: 'group', 'aria-labelledby': 'print-g-names' },
})
export class NamesOptions {
  protected readonly model = inject(PrintModel);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  /** A page sized to the tree has the names across its foot, always. */
  protected readonly onPaper = computed(() => this.model.settings().paper !== FIT_PAPER);
  /** How the names got where they are: the page put them there, they are held at a place, or they lie where they were dragged. */
  protected readonly placed = computed<'page' | 'held' | 'hand'>(() => {
    const s = this.model.view();
    return s.legendAnchor ? 'held' : s.legendBox ? 'hand' : 'page';
  });
  /** The names have a box sized by hand: only in one of those is there room to stand here or there. */
  protected readonly sized = computed(() => !!this.model.view().legendBox);
  /**
   * The names can come to stand under the title (or over it): held at the top of the page or at its foot, or
   * left to the page, which may put them in a corner there. The gap is offered then.
   */
  protected readonly underTitle = computed(() => {
    const s = this.model.view();
    if (!s.showTitle) return false;
    return s.legendAnchor ? anchorShares(s.legendAnchor).y !== 0.5 : !s.legendBox;
  });
  protected readonly gapText = computed(() =>
    new Intl.NumberFormat(this.i18n.locale().intl, { maximumFractionDigits: 2 }).format(this.model.view().legendGap ?? LEGEND_GAP_CM),
  );

  /** The heading's place as the picker shows it: the top row's left, middle or right. */
  protected readonly headAnchor = computed<Anchor>(() => {
    const a = this.model.view().legendHeadAlign;
    return a === 'left' ? 'top-left' : a === 'right' ? 'top-right' : 'top';
  });

  /** The heading over the names stands at the left, in the middle or at the right of their box. It moves nothing else, so it applies at once. */
  protected alignHeading(anchor: Anchor): void {
    const x = anchorShares(anchor).x;
    this.model.set({ legendHeadAlign: x === 0 ? 'left' : x === 1 ? 'right' : undefined });
  }

  /** How wide the heading and its rule are; empty for as wide as the word. Applied at once. */
  protected setHeadWidth(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(',', '.').trim();
    const value = Number(raw);
    const { min, max } = this.model.headRangeCm();
    this.model.set({ legendHeadWidth: raw && Number.isFinite(value) && value > 0 ? Math.min(max, Math.max(min, value)) : undefined });
  }

  // Every change here waits to be applied, with the others that wait (PrintModel.staged).

  /** Held at a place from now on. A box sized by hand keeps its size there. */
  protected hold(anchor: Anchor): void {
    this.model.stage({ legendAnchor: anchor });
  }

  /** Back to where the page puts them: across the foot, or in a corner the tree leaves empty. */
  protected leaveToPage(): void {
    this.model.stage({ legendAnchor: undefined, legendBox: undefined });
  }

  protected float(anchor: Anchor): void {
    this.model.stage({ legendAlign: anchor === 'center' ? undefined : anchor });
  }

  /** The box as big as the names need and no bigger; held where it is held. */
  protected fitBox(): void {
    this.model.stage({ legendBox: undefined });
  }

  /** The gap between the title and the names under it; empty for the usual. */
  protected setGap(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(',', '.').trim();
    const value = Number(raw);
    this.model.stage({ legendGap: raw && Number.isFinite(value) && value >= 0 ? Math.min(LEGEND_GAP_MAX, value) : undefined });
  }
}
