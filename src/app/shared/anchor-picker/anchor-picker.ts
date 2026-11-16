import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ANCHOR_VALUES, Anchor, anchorShares } from '../../core/model/types';
import { I18n } from '../../i18n/i18n';
import { MessageKey } from '../../i18n/locales';

const LABELS: Readonly<Record<Anchor, MessageKey>> = {
  'top-left': 'anchor.topLeft',
  top: 'anchor.top',
  'top-right': 'anchor.topRight',
  left: 'anchor.left',
  center: 'anchor.center',
  right: 'anchor.right',
  'bottom-left': 'anchor.bottomLeft',
  bottom: 'anchor.bottom',
  'bottom-right': 'anchor.bottomRight',
};

/**
 * A place on a page or in a box, picked on a small picture of it: the four corners, the middles of the
 * sides and the middle. Nothing is picked while `value` is null (the thing was put somewhere by hand).
 */
@Component({
  selector: 'stemma-anchor-picker',
  templateUrl: './anchor-picker.html',
  styleUrl: './anchor-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnchorPicker {
  protected readonly t = inject(I18n).t;

  readonly value = input<Anchor | null>(null);
  /** Only the top row is offered (left, middle, right): for a title. */
  readonly topOnly = input(false);
  /** The id of the element that names the group. */
  readonly labelledBy = input('');
  readonly disabled = input(false);
  readonly valueChange = output<Anchor>();

  protected readonly cells = computed(() =>
    ANCHOR_VALUES.filter((a) => !this.topOnly() || anchorShares(a).y === 0).map((anchor) => ({ anchor, label: LABELS[anchor] })),
  );
}
