import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Conflict, NewPerson, Side, planMerge } from '../../../core/part/merge';
import { relationshipStatus } from '../../../core/model/relationship';
import { Family, LifeEvent, Person, TreeDocument } from '../../../core/model/types';
import { TreeStore } from '../../../core/store/tree-store';
import { I18n } from '../../../i18n/i18n';
import { MessageKey } from '../../../i18n/locales';
import { Icon } from '../../../shared/icon/icon';
import { PersonPicker } from '../../../shared/person-picker/person-picker';
import { PartActions } from '../../../state/part-actions';

/** The conflicts of one person or family, under their name. */
interface ConflictGroup {
  key: string;
  title: string;
  conflicts: Conflict[];
}

/** The choice in a new person's list that opens the search for someone else in the tree. */
const SOMEONE_ELSE = '?';

/**
 * Merging a tree file into the tree (see core/part/merge.ts): what comes in by itself, who in the file may be
 * someone the tree already has, the fields changed on both sides, and who the file no longer has. Nothing changes
 * until Merge, and Merge is one step to undo.
 */
@Component({
  selector: 'stemma-part-merge',
  imports: [Icon, PersonPicker],
  templateUrl: './part-merge.html',
  styleUrl: './part-merge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartMerge {
  private readonly store = inject(TreeStore);
  private readonly parts = inject(PartActions);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  readonly part = input.required<TreeDocument>();
  readonly name = input.required<string>();
  readonly done = output<void>();

  protected readonly someoneElse = SOMEONE_ELSE;
  protected readonly sides: readonly Side[] = ['local', 'imported'];
  private readonly assign = signal<ReadonlyMap<string, string | null>>(new Map());
  private readonly take = signal<ReadonlyMap<string, Side>>(new Map());
  private readonly remove = signal<ReadonlySet<string>>(new Set());
  /** The person of the file for whom someone else in the tree is being searched for. */
  protected readonly picking = signal<string | null>(null);

  protected readonly plan = computed(() => planMerge(this.store.doc(), this.part(), { assign: this.assign(), take: this.take(), remove: this.remove() }));

  /** New in the file but maybe someone the tree has: to look at. */
  protected readonly doubtful = computed(() => this.plan().newPeople.filter((n) => n.candidates.length || n.target));
  /** New in the file, and nobody like them in the tree. */
  protected readonly plainNew = computed(() => this.plan().newPeople.filter((n) => !n.candidates.length && !n.target));

  protected readonly groups = computed<ConflictGroup[]>(() => {
    const out = new Map<string, ConflictGroup>();
    for (const c of this.plan().conflicts) {
      const key = `${c.kind}:${c.localId}`;
      let g = out.get(key);
      if (!g) {
        g = { key, title: c.kind === 'person' ? this.label(c.local as Person) : this.familyTitle(c.local as Family), conflicts: [] };
        out.set(key, g);
      }
      g.conflicts.push(c);
    }
    return [...out.values()];
  });

  protected readonly source = computed(() => {
    const info = this.part().part;
    if (!info) return this.t('part.merge.notPart', { name: this.name() });
    const date = info.exported ? this.i18n.dates().fullDate({ value: info.exported.slice(0, 10) }) : '';
    return this.t('part.merge.from', { name: this.name(), source: info.source, date });
  });

  protected readonly summary = computed(() => {
    const s = this.plan().summary;
    return this.t('part.merge.summary', {
      added: this.t('part.people', { count: s.added }),
      updated: this.t('part.people', { count: s.updated }),
      families: this.t('part.families', { count: s.familiesAdded + s.familiesUpdated }),
    });
  });

  /** People of the tree already taken by someone else in the file. */
  protected excludeFor(n: NewPerson): ReadonlySet<string> {
    const unmatched = new Set(this.plan().newPeople.map((p) => p.person.id));
    const out = new Set(
      this.part()
        .people.filter((p) => !unmatched.has(p.id) && this.store.index().person(p.id))
        .map((p) => p.id),
    );
    for (const other of this.plan().newPeople) if (other !== n && other.target) out.add(other.target);
    return out;
  }

  /** The choices for a new person: the likely ones, and whoever was picked from the whole tree. */
  protected options(n: NewPerson): string[] {
    return n.target && !n.candidates.includes(n.target) ? [...n.candidates, n.target] : n.candidates;
  }

  protected label(p: Person | undefined): string {
    if (!p) return '—';
    const dates = this.i18n.lifespan(p);
    return dates ? `${this.i18n.name(p)} (${dates})` : this.i18n.name(p);
  }

  protected localLabel(id: string): string {
    return this.label(this.store.index().person(id));
  }

  private familyTitle(f: Family): string {
    const names = f.partners.map((id) => this.i18n.name(this.store.index().person(id)));
    return names.length ? names.join(' & ') : this.t('part.merge.family');
  }

  protected changeTitle(c: Conflict): string {
    return c.kind === 'person' ? this.label(c.local as Person) : this.familyTitle(c.local as Family);
  }

  protected fieldLabel(c: Conflict): string {
    if (c.field === 'kids') return this.t('part.merge.connections');
    return this.t(`part.field.${c.field}` as MessageKey);
  }

  private event(e: LifeEvent | undefined, died: boolean): string {
    if (!e) return died ? this.t('part.value.alive') : this.t('part.value.none');
    if (e.dateUnknown) return this.t('part.value.dateUnknown');
    const date = e.date?.value || e.date?.text ? this.i18n.dates().fullDate(e.date) : '';
    return date || (died ? this.t('part.value.died') : this.t('part.value.none'));
  }

  /** A side's value, as words. */
  protected value(c: Conflict, side: Side): string {
    const rec = side === 'local' ? c.local : c.imported;
    if (c.kind === 'family') {
      const f = rec as Family;
      if (c.field === 'status') return this.t(`status.${relationshipStatus(f)}` as MessageKey);
      if (c.field === 'kids') {
        const names = new Map(this.plan().doc.people.map((p) => [p.id, p]));
        const name = (id: string) => this.i18n.name(names.get(id) ?? this.store.index().person(id));
        const partners = f.partners.map(name).join(' & ');
        const children = f.children.map((child) => `${name(child.personId)} (${this.t(`childRelation.${child.relation}` as MessageKey)})`).join(', ');
        return [partners, children].filter(Boolean).join(' / ') || this.t('part.value.none');
      }
      return f.notes?.trim() || this.t('part.value.none');
    }
    const p = rec as Person;
    switch (c.field) {
      case 'sex':
        return this.t(`sex.${p.sex}` as MessageKey);
      case 'given':
        return p.name.givenUnknown ? this.t('part.value.unknown') : p.name.given.trim() || this.t('part.value.none');
      case 'surname':
        return (p.name.derived ? '' : p.name.surname.trim()) || this.t('part.value.none');
      case 'birthSurname':
        return p.name.birthSurname?.trim() || this.t('part.value.none');
      case 'birth':
        return this.event(p.birth, false);
      case 'death':
        return this.event(p.death, true);
      case 'notes':
        return p.notes?.trim() || this.t('part.value.none');
      case 'photo':
        return p.photo ? '' : this.t('part.value.none');
      case 'hidden':
        return p.hiddenFromPrint ? this.t('part.value.hidden') : this.t('part.value.shown');
      default:
        return '';
    }
  }

  protected photo(c: Conflict, side: Side): string | undefined {
    if (c.kind !== 'person' || c.field !== 'photo') return undefined;
    return (side === 'local' ? (c.local as Person) : (c.imported as Person)).photo;
  }

  protected chosen(c: Conflict): Side {
    return this.take().get(c.key) ?? c.preferred;
  }

  protected setSide(c: Conflict, side: Side): void {
    const next = new Map(this.take());
    next.set(c.key, side);
    this.take.set(next);
  }

  protected setTarget(n: NewPerson, event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    if (raw === SOMEONE_ELSE) {
      this.picking.set(n.person.id);
      return;
    }
    this.assignTo(n.person.id, raw || null);
  }

  protected picked(n: NewPerson, id: string | null): void {
    if (!id) return;
    this.assignTo(n.person.id, id);
    this.picking.set(null);
  }

  private assignTo(fileId: string, localId: string | null): void {
    const next = new Map(this.assign());
    next.set(fileId, localId);
    this.assign.set(next);
    if (this.picking() === fileId) this.picking.set(null);
  }

  protected removing(id: string): boolean {
    return this.remove().has(id);
  }

  protected toggleRemove(id: string): void {
    const next = new Set(this.remove());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.remove.set(next);
  }

  protected merge(): void {
    this.parts.merge(this.plan());
    this.done.emit();
  }
}
