import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { ChartModel } from '../../../state/chart-model';
import { FamilyView } from '../../../state/family-view';

/**
 * In the family view, in place of the Who is shown button: the families on
 * the chart, each of which can be taken out, and the way back to the whole tree.
 */
@Component({
  selector: 'stemma-family-bar',
  imports: [Icon],
  templateUrl: './family-bar.html',
  styleUrl: './family-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', '[attr.aria-label]': "t('familyView.bar')" },
})
export class FamilyBar {
  private readonly model = inject(ChartModel);
  protected readonly familyView = inject(FamilyView);
  protected readonly t = inject(I18n).t;

  protected readonly families = computed(() => {
    const names = this.model.familyNames();
    const tinctures = this.model.familyTinctures();
    return this.model.familyKeys().map((key) => ({ key, label: names.get(key)?.label ?? key, tincture: tinctures.get(key) ?? 'argent' }));
  });
}
