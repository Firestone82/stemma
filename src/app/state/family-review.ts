import { Injectable, computed, inject, signal } from '@angular/core';
import { clearFamilyChecks, setFamilyChecked } from '../core/model/operations';
import { dateYear } from '../core/model/dates';
import { Family, Person } from '../core/model/types';
import { TreeStore } from '../core/store/tree-store';
import { ToastService } from '../core/services/toast';
import { I18n } from '../i18n/i18n';
import { DataChecks } from './data-checks';
import { PersonActions } from './person-actions';
import { UiState } from './ui-state';

/** One person in the family under review: who, when, and what looks wrong or is missing. */
export interface ReviewPerson {
  id: string;
  name: string;
  life: string;
  role: 'partner' | 'child';
  notes: string[];
}

/**
 * The review: a walk through the families, one after another, each shown with its people and whatever looks
 * wrong or is missing, to be confirmed as right (it is then marked in the file, and not asked about again) or
 * left for later. The family under review is selected on the chart, so it can be corrected in the usual
 * panel while the review waits. Families come oldest first.
 */
@Injectable({ providedIn: 'root' })
export class FamilyReview {
  private readonly store = inject(TreeStore);
  private readonly i18n = inject(I18n);
  private readonly checks = inject(DataChecks);
  private readonly people = inject(PersonActions);
  private readonly toast = inject(ToastService);
  private readonly ui = inject(UiState);

  /** The review is going on: its bar is shown. */
  readonly active = signal(false);
  private readonly queue = signal<readonly string[]>([]);
  readonly position = signal(0);

  /** The families worth asking about (someone in them), the oldest first. */
  readonly families = computed(() => {
    const doc = this.store.doc();
    const born = new Map(doc.people.map((p) => [p.id, dateYear(p.birth?.date) ?? Infinity]));
    const first = (f: Family) => Math.min(...[...f.partners, ...f.children.map((c) => c.personId)].map((id) => born.get(id) ?? Infinity));
    return doc.families
      .filter((f) => f.partners.length > 0 || f.children.length > 1)
      .map((f, i) => ({ f, i, year: first(f) }))
      .sort((a, b) => a.year - b.year || a.i - b.i)
      .map((x) => x.f);
  });

  readonly total = computed(() => this.families().length);
  readonly confirmed = computed(() => this.families().filter((f) => f.checked).length);
  readonly remaining = computed(() => this.total() - this.confirmed());

  readonly count = computed(() => this.queue().length);
  readonly currentId = computed(() => this.queue()[this.position()]);

  /** The family under review, its people and what is wrong with them. */
  readonly current = computed(() => {
    const id = this.currentId();
    const doc = this.store.doc();
    const family = doc.families.find((f) => f.id === id);
    if (!family) return null;
    const byId = new Map(doc.people.map((p) => [p.id, p]));
    const gaps = this.checks.result().gaps;
    const problems = this.checks.byPerson();
    const t = this.i18n.t;
    const line = (p: Person | undefined, role: ReviewPerson['role']): ReviewPerson | null => {
      if (!p) return null;
      const notes: string[] = [];
      for (const g of gaps) if (g.personIds.includes(p.id)) notes.push(t(`review.missing.${g.kind}` as 'review.missing.given'));
      const bad = problems.get(p.id);
      if (bad) notes.push(...bad.split('\n'));
      return { id: p.id, name: this.i18n.name(p), life: this.i18n.lifespan(p), role, notes };
    };
    const partners = family.partners.map((pid) => line(byId.get(pid), 'partner')).filter((x): x is ReviewPerson => !!x);
    const children = family.children.map((c) => line(byId.get(c.personId), 'child')).filter((x): x is ReviewPerson => !!x);
    return {
      family,
      title: partners.map((p) => p.name).join(' & ') || t('review.unknownParents'),
      partners,
      children,
      flagged: [...partners, ...children].reduce((n, p) => n + p.notes.length, 0),
    };
  });

  /** Starts going through the families that are not confirmed yet; `again` takes every confirmation off first. */
  start(again = false): void {
    if (again) this.store.update(clearFamilyChecks, 'review reset');
    const queue = this.families()
      .filter((f) => !f.checked)
      .map((f) => f.id);
    if (!queue.length) {
      this.toast.show(this.i18n.t('review.nothing'));
      return;
    }
    this.queue.set(queue);
    this.position.set(0);
    this.active.set(true);
    this.show();
  }

  /** The data of this family is right: marked so in the file, and on to the next. */
  confirm(): void {
    const id = this.currentId();
    if (!id) return;
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.store.update((doc) => setFamilyChecked(doc, id, day), 'review confirm');
    this.go(1);
  }

  /** Leaves this family for later and goes on. */
  skip(): void {
    this.go(1);
  }

  back(): void {
    this.go(-1);
  }

  finish(): void {
    this.active.set(false);
    this.queue.set([]);
  }

  private go(by: number): void {
    const next = this.position() + by;
    if (next < 0) return;
    if (next >= this.queue().length) {
      this.finish();
      this.toast.show(this.i18n.t('review.done', { confirmed: this.confirmed(), total: this.total() }));
      return;
    }
    this.position.set(next);
    this.show();
  }

  /** The family under review selected on the chart, and brought to its middle. */
  private show(): void {
    const id = this.currentId();
    if (!id) return;
    this.people.openFamily(id);
    this.ui.centreFamily(id);
  }

  /** Opens a person of the family in the panel, to correct them. */
  open(personId: string): void {
    this.people.select(personId);
  }
}
