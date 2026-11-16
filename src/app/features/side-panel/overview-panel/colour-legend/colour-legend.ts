import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { updateView } from '../../../../core/model/operations';
import { TreeStore } from '../../../../core/store/tree-store';
import { I18n } from '../../../../i18n/i18n';
import { Switch } from '../../../../shared/switch/switch';
import { ChartModel } from '../../../../state/chart-model';
import { FamilyView } from '../../../../state/family-view';

/**
 * What the colours of the name shields mean: one colour per family name; and whether the Polish and the
 * Czech spelling of a name are one family (Nowak and Novák).
 */
@Component({
  selector: 'stemma-colour-legend',
  imports: [Switch],
  templateUrl: './colour-legend.html',
  styleUrl: './colour-legend.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColourLegend {
  private readonly model = inject(ChartModel);
  private readonly store = inject(TreeStore);
  protected readonly t = inject(I18n).t;

  protected readonly united = computed(() => this.store.doc().view.uniteSpellings);
  protected readonly foreign = computed(() => this.store.doc().view.uniteForeign);

  private readonly familyView = inject(FamilyView);

  protected unite(key: 'uniteSpellings' | 'uniteForeign', on: boolean): void {
    // The families are other families afterwards: a view of some of them goes back to the whole tree.
    this.familyView.exit();
    this.store.update((doc) => updateView(doc, { [key]: on }));
  }

  /** Legend entries: family names, and a word of the app for the names that appear only once. */
  protected readonly entries = computed(() =>
    this.model.colors().legend.map((l) => ({ key: l.key, tincture: l.tincture, label: l.key === '' ? this.t('legend.others') : l.label, count: l.count })),
  );
}
