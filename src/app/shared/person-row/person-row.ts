import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../icon/icon';

/**
 * A person in a list: their family colour, name and dates. Put it on a button:
 * <button type="button" stemmaPersonRow [name]="…" (click)="…">.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- drawn inside an <svg> (or on a <button>), so an attribute selector
  selector: 'button[stemmaPersonRow], span[stemmaPersonRow]',
  imports: [Icon],
  templateUrl: './person-row.html',
  styleUrl: './person-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonRow {
  readonly name = input.required<string>();
  readonly dates = input('');
  readonly tincture = input('argent');
  /** A short label after the name, such as "adopted". */
  readonly tag = input('');
  /** An icon instead of the family colour. */
  readonly icon = input<string>();
  /** What still has to be filled in; shown as a small flag with this as its tooltip. */
  readonly missing = input('');
  /** Dates that cannot be right: the flag turns red, with this in its tooltip. */
  readonly problem = input('');
  protected readonly flagText = computed(() => [this.problem(), this.missing()].filter(Boolean).join('\n'));
  /** A number in front, for children in birth order. */
  readonly ordinal = input<number>();
}
