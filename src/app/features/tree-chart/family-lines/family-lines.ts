import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { roundedPath, sharedPaths } from '../../../core/layout/lines';
import { isPortal } from '../../../core/model/family-view';
import { LayoutResult } from '../../../core/layout/types';
import { TreeStore } from '../../../core/store/tree-store';

/** How round the corners of the lines are. */
const CORNER = 7;

/**
 * Lines from parents to their children. The direct line of the person the chart is drawn around is a
 * little heavier; the lines of the selected person's ancestors and descendants are drawn darker, on top.
 * In a family view of several families, a click on a line takes a family back out (see `cuts`).
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

  /** The person the pointer is on: the lines of their families (their parents' and their own) light up. */
  readonly hover = input<string | null>(null);

  private readonly lit = computed<ReadonlySet<string>>(() => {
    const id = this.hover();
    if (!id) return new Set();
    const index = this.store.index();
    return new Set([...index.parentFamilies(id), ...index.partnerFamilies(id)].map((f) => f.id));
  });

  protected readonly drops = computed(() => {
    const lineage = this.lineage();
    const lit = this.lit();
    const index = this.store.index();
    const rated = this.layout().lines.map((l) => {
      const fam = index.family(l.familyId);
      const onPath = !!lineage && lineage.has(l.childId) && !!fam && fam.partners.some((p) => lineage.has(p));
      const hover = lit.has(l.familyId);
      return { line: l, onPath, hover, weight: Number(l.trunk) + 2 * Number(onPath) + 4 * Number(hover) - 0.5 * Number(l.relation !== 'biological') };
    });
    // Every stretch is drawn once (see sharedPaths), by the line that matters most there; those go on top.
    rated.sort((a, b) => b.weight - a.weight);
    const paths = sharedPaths(
      rated.map((r) => r.line),
      CORNER,
    );
    return rated
      .map((r, i) => ({
        key: r.line.key,
        d: paths[i],
        relation: r.line.relation,
        trunk: r.line.trunk,
        onPath: r.onPath,
        hover: r.hover,
        off: isPortal(r.line.childId) || isPortal(r.line.familyId),
      }))
      .filter((p) => p.d)
      .reverse();
  });

  /** The lines that can be clicked, one group per family. */
  protected readonly cuttable = computed(() => {
    const cuts = this.cuts();
    if (!cuts.size) return [];
    const byFamily = new Map<string, string[]>();
    for (const l of this.layout().lines) {
      if (!cuts.has(l.familyId)) continue;
      const paths = byFamily.get(l.familyId) ?? [];
      paths.push(roundedPath(l.points, CORNER));
      byFamily.set(l.familyId, paths);
    }
    return [...byFamily].map(([familyId, paths]) => ({ familyId, title: cuts.get(familyId)!, paths }));
  });

  protected onCut(familyId: string, event: Event): void {
    event.stopPropagation();
    this.takeOut.emit(familyId);
  }
}
