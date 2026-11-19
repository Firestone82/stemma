import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { Icon } from '../../shared/icon/icon';
import { Scroll } from '../../shared/scroll/scroll';
import { FamilyReview } from '../../state/family-review';

/**
 * The review's bar over the foot of the chart: the family being gone through, its people with what is wrong or
 * missing in each, and the buttons to confirm it, leave it for later or step back. A name opens that person in the panel.
 */
@Component({
  selector: 'stemma-review-bar',
  imports: [Icon, Scroll],
  templateUrl: './review-bar.html',
  styleUrl: './review-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewBar {
  protected readonly review = inject(FamilyReview);
  protected readonly t = inject(I18n).t;
}
