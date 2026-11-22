import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { linkedFamilies } from '../../../core/family-document/outline';
import { TreeStore } from '../../../core/store/tree-store';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';
import { ChartModel } from '../../../state/chart-model';
import { DocumentActions } from '../../../state/document-actions';

/** A family in the list: its name, how many were born into it, and the families it leads into. */
interface FamilyItem {
  key: string;
  label: string;
  count: number;
  links: readonly string[];
}

/** A family as the tree shows it: an item, where it is in the tree, and whether it is open. */
interface FamilyNode {
  item: FamilyItem;
  /** Families above it in the tree and itself, by key: unique for the row, and the loop guard. */
  path: string;
  depth: number;
  open: boolean;
  /** Whether it leads into families not above it, so it can be opened. */
  opens: boolean;
}

export type FamilyState = 'full' | 'partial' | 'none';

/**
 * Which families the Word document sets out: a tree of the families, each leading into the families its
 * daughters' children (and theirs) carry on. A family ticked is set out in full; a family a ticked one
 * leads into is half ticked by itself: it comes in with only those descendants, until it is ticked too.
 */
@Component({
  selector: 'stemma-family-export',
  imports: [Icon],
  templateUrl: './family-export.html',
  styleUrl: './family-export.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FamilyExport {
  private readonly store = inject(TreeStore);
  private readonly chart = inject(ChartModel);
  private readonly documents = inject(DocumentActions);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly done = output<void>();

  /** Every family with someone to print, the biggest first. */
  private readonly items = computed<FamilyItem[]>(() => {
    const index = this.store.index();
    const keyOf = this.chart.familyKeyOf();
    const names = this.chart.familyNames();
    const links = new Map<string, Set<string>>();
    const counts = new Map<string, number>();
    for (const p of this.store.doc().people) {
      if (p.hiddenFromPrint) continue;
      const key = keyOf.get(p.id) ?? '';
      counts.set(key, (counts.get(key) ?? 0) + 1);
      for (const c of index.children(p.id)) {
        const other = keyOf.get(c.id) ?? '';
        if (other !== key && !c.hiddenFromPrint) links.set(key, (links.get(key) ?? new Set<string>()).add(other));
      }
    }
    const label = (key: string) => names.get(key)?.label ?? key;
    const bySize = (a: string, b: string) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || this.i18n.compare(label(a), label(b));
    return [...counts.keys()]
      .sort(bySize)
      .map((key) => ({ key, label: label(key), count: counts.get(key) ?? 0, links: [...(links.get(key) ?? [])].sort(bySize) }));
  });
  private readonly byKey = computed(() => new Map(this.items().map((i) => [i.key, i])));

  /** The families ticked: all of them to begin with. */
  protected readonly chosen = signal<ReadonlySet<string>>(new Set(this.items().map((i) => i.key)));
  /** The rows opened, by path. */
  private readonly opened = signal<ReadonlySet<string>>(new Set());

  /** The families the ticked ones lead into, which come in with only those descendants. */
  private readonly partial = computed(() => {
    const chosen = this.chosen();
    const linked = linkedFamilies(this.store.index(), this.chart.familyKeyOf(), chosen);
    return new Set([...linked.keys()].filter((k) => !chosen.has(k) && this.byKey().has(k)));
  });

  /** The rows of the tree, as opened: every family at the top, the ones it leads into under it. */
  protected readonly rows = computed<FamilyNode[]>(() => {
    const opened = this.opened();
    const byKey = this.byKey();
    const out: FamilyNode[] = [];
    const walk = (item: FamilyItem, above: readonly string[]) => {
      const path = [...above, item.key].join('/');
      const below = item.links.filter((k) => !above.includes(k) && k !== item.key && byKey.has(k));
      const open = opened.has(path);
      out.push({ item, path, depth: above.length, open, opens: below.length > 0 });
      if (open) for (const k of below) walk(byKey.get(k)!, [...above, item.key]);
    };
    for (const item of this.items()) walk(item, []);
    return out;
  });

  protected readonly summary = computed(() => this.t('dialog.familyExport.summary', { count: this.chosen().size, partial: this.partial().size }));

  protected state(key: string): FamilyState {
    return this.chosen().has(key) ? 'full' : this.partial().has(key) ? 'partial' : 'none';
  }

  protected toggle(key: string): void {
    const next = new Set(this.chosen());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.chosen.set(next);
  }

  protected toggleOpen(path: string): void {
    const next = new Set(this.opened());
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this.opened.set(next);
  }

  protected all(): void {
    this.chosen.set(new Set(this.items().map((i) => i.key)));
  }

  protected none(): void {
    this.chosen.set(new Set());
  }

  protected async export(): Promise<void> {
    const keys = this.items()
      .map((i) => i.key)
      .filter((k) => this.chosen().has(k));
    this.done.emit();
    await this.documents.saveFamilyDocument(keys);
  }
}
