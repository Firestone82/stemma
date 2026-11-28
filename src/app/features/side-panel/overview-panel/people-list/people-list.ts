import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, output, signal, viewChild } from '@angular/core';
import { normalizeQuery, searchText, unitingOf } from '../../../../core/model/names';
import { Person } from '../../../../core/model/types';
import { relativesOf } from '../../../../core/poster/scope';
import { TreeStore } from '../../../../core/store/tree-store';
import { I18n } from '../../../../i18n/i18n';
import { Icon } from '../../../../shared/icon/icon';
import { missingText } from '../../../../shared/missing';
import { DataChecks } from '../../../../state/data-checks';
import { ChartModel } from '../../../../state/chart-model';
import { FamilyView } from '../../../../state/family-view';
import { UiState } from '../../../../state/ui-state';
import { FamilyGroupItem, FamilyRow } from './family-group/family-group';
import { groupByFamily } from './family-groups';

/** Small trees start with every family open; bigger ones as a list of families. */
const OPEN_UP_TO = 15;

/**
 * Everyone in the tree, grouped by family name (Mikula and Mikulová together).
 * Each family opens and closes; searching opens the families with a match.
 */
@Component({
  selector: 'stemma-people-list',
  imports: [Icon, FamilyGroupItem],
  templateUrl: './people-list.html',
  styleUrl: './people-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeopleList {
  private readonly store = inject(TreeStore);
  private readonly model = inject(ChartModel);
  private readonly ui = inject(UiState);
  private readonly i18n = inject(I18n);
  private readonly checks = inject(DataChecks);
  private readonly familyView = inject(FamilyView);
  protected readonly t = this.i18n.t;

  readonly open = output<string>();
  readonly add = output<void>();

  protected readonly query = signal('');
  protected readonly searchable = this.ui.peopleSearchable;
  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('searchField');
  private readonly openByDefault = computed(() => this.store.doc().people.length <= OPEN_UP_TO);

  constructor() {
    // Ctrl+F (Shortcuts): the search field takes the focus once it is on the page, with anything typed in it selected.
    afterRenderEffect(() => {
      const input = this.searchField()?.nativeElement;
      if (!input || !this.ui.findRequested()) return;
      this.ui.findRequested.set(false);
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: 'nearest' });
      input.select();
    });
  }

  protected readonly families = computed(() => {
    const q = normalizeQuery(this.query());
    const colors = this.model.colors();
    const familyColors = new Map(colors.legend.map((e) => [e.key, e.tincture]));
    const chosen = this.ui.familyOpen();
    const hidden = this.model.hidden();
    const names = this.model.familyNames();
    const shown = this.model.familyKeys();
    const people = this.store.doc().people.filter((p) => !q || searchText(p).includes(q));
    const problems = this.checks.byPerson();
    const row = (p: Person): FamilyRow => ({
      id: p.id,
      name: this.i18n.sortName(p),
      dates: this.i18n.lifespan(p),
      tincture: colors.byPerson.get(p.id) ?? 'argent',
      offChart: hidden.has(p.id),
      missing: missingText(this.i18n, p),
      problem: problems.get(p.id) ?? '',
    });
    return groupByFamily(people, this.i18n.compare, unitingOf(this.store.doc().view)).map((g) => ({
      key: g.key,
      label: g.key ? g.spellings.slice(0, 3).join(' / ') : this.t('overview.noSurname'),
      tincture: familyColors.get(g.key) ?? 'argent',
      members: g.members.map(row),
      count: this.t('overview.people', { count: g.members.length }),
      open: !!q || (chosen.get(g.key) ?? this.openByDefault()),
      // The family view goes by the family people were born into; a name only married into has nobody to show.
      viewName: names.has(g.key) && !shown.includes(g.key) ? names.get(g.key)!.label : '',
    }));
  });

  protected readonly offChartHint = computed(() =>
    this.model.familyKeys().length
      ? this.t('familyView.offChart')
      : this.model.focusedActive()
        ? this.t('focusedView.offChart')
        : this.t('relatives.hiddenNote', { level: this.t(`relatives.${relativesOf(this.model.view())}`) }),
  );

  /** Whether the button offers to open every family (some are closed) or to close them. */
  protected readonly canOpenAll = computed(() => this.families().some((f) => !f.open));

  protected search(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected toggle(key: string, open: boolean): void {
    this.ui.familyOpen.update((m) => new Map(m).set(key, !open));
  }

  /** From the whole tree, a family view of this family; in a family view, this family added to it. */
  protected viewFamily(key: string): void {
    this.familyView.add(key);
  }

  protected readonly inFamilyView = computed(() => this.model.familyKeys().length > 0);

  protected setAll(open: boolean): void {
    this.ui.familyOpen.set(new Map(this.families().map((f) => [f.key, open])));
  }
}
