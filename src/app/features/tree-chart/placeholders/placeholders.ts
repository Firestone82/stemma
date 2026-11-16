import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LayoutResult } from '../../../core/layout/types';
import { isPortal } from '../../../core/model/family-view';
import { I18n } from '../../../i18n/i18n';

/** Card-sized dashed boxes with a question mark, for parents nobody has entered yet; siblings hang from them. */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- drawn inside an <svg> (or on a <button>), so an attribute selector
  selector: 'g[stemmaPlaceholders]',
  templateUrl: './placeholders.html',
  styleUrl: './placeholders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Placeholders {
  protected readonly t = inject(I18n).t;
  protected readonly radius = 4;

  readonly layout = input.required<LayoutResult>();
  /** Without the places of the families a family view leaves off: those are buttons (family-balloons). */
  protected readonly holders = computed(() => this.layout().placeholders.filter((p) => !isPortal(p.familyId)));
  /** A placeholder was clicked (its family id). */
  readonly pick = output<string>();

  protected onPick(familyId: string, event: Event): void {
    event.stopPropagation();
    this.pick.emit(familyId);
  }
}
