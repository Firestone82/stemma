import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LayoutResult } from '../../../core/layout/layout-types';
import { connectorPaths, linkPath } from '../../../core/layout/paths';
import { TreeStore } from '../../../core/store/tree-store';
import { ChartModel } from '../../../state/chart-model';

/**
 * Lines from parents to their children. The lines of the selected person's
 * ancestors and descendants are drawn darker, on top. In a family view of
 * several families, a click on a line takes a family back out (see `cuts`).
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- drawn inside an <svg> (or on a <button>), so an attribute selector
  selector: 'g[stemmaFamilyLines]',
  templateUrl: './family-lines.html',
  styleUrl: './family-lines.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilyLines {
  private readonly store = inject(TreeStore);
  private readonly model = inject(ChartModel);

  readonly layout = input.required<LayoutResult>();
  /** Families whose lines can be clicked, with what the click does as the tooltip. */
  readonly cuts = input<ReadonlyMap<string, string>>(new Map());
  readonly takeOut = output<string>();

  /** The selected person with all their ancestors and descendants. */
  private readonly lineage = computed<Set<string> | null>(() => {
    const s = this.store.selection();
    if (s?.kind !== 'person') return null;
    const index = this.store.index();
    return new Set([s.id, ...index.ancestors(s.id), ...index.descendants(s.id)]);
  });

  protected readonly drops = computed(() => {
    const lineage = this.lineage();
    const index = this.store.index();
    const out: { key: string; d: string; relation: string; onPath: boolean }[] = [];
    for (const c of this.layout().connectors) {
      const fam = index.family(c.familyId);
      const parentsOnPath = !!lineage && !!fam && fam.partners.some((p) => lineage.has(p));
      for (const p of connectorPaths(c, 'square', 10)) {
        out.push({ key: `${c.familyId}|${p.childId}`, d: p.d, relation: p.relation, onPath: parentsOnPath && lineage!.has(p.childId) });
      }
    }
    return out.sort((a, b) => Number(a.onPath) - Number(b.onPath));
  });

  /** The lines that can be clicked, one group per family. */
  protected readonly cuttable = computed(() => {
    const cuts = this.cuts();
    if (!cuts.size) return [];
    return this.layout()
      .connectors.filter((c) => cuts.has(c.familyId))
      .map((c) => ({ familyId: c.familyId, title: cuts.get(c.familyId)!, paths: connectorPaths(c, 'square', 10).map((p) => p.d) }));
  });

  protected onCut(familyId: string, event: Event): void {
    event.stopPropagation();
    this.takeOut.emit(familyId);
  }

  protected readonly secondary = computed(() => this.layout().links.map((l) => ({ key: `${l.familyId}|${l.childId}`, d: linkPath(l), relation: l.relation })));
}
