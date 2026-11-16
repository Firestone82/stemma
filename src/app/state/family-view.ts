import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { decodeFamilyKeys, encodeFamilyKeys } from '../core/model/family-view';
import { unitedKey, unitingOf } from '../core/model/names';
import { TreeStore } from '../core/store/tree-store';
import { PRINT_HASH } from '../features/print-studio/print-route';
import { ChartBusy } from './chart-busy';
import { UiState } from './ui-state';

/** The address of the family view: the app's address with this and the families after it. */
export const FAMILY_HASH = '#/family/';

/**
 * The family view: the chart shows only the families chosen here (by
 * surnameKey), with balloons for everyone else (see core/model/family-view).
 * Not saved with the tree; kept in the address (#/family/novak,ashworth), so
 * Back returns to the whole tree and a reload keeps the view. Opening another
 * tree goes back to the whole tree.
 */
@Injectable({ providedIn: 'root' })
export class FamilyView {
  private readonly store = inject(TreeStore);
  private readonly ui = inject(UiState);
  private readonly chart = inject(ChartBusy);

  /** The families shown, in the order they were added; null for the whole tree. */
  readonly keys = signal<readonly string[] | null>(null);
  readonly active = computed(() => !!this.keys()?.length);
  /**
   * When each family came into the view: those added together (a balloon's
   * families) share a number and go out together. Families from the address
   * have none; their order stands in.
   */
  readonly batches = signal<ReadonlyMap<string, number>>(new Map());

  /** Families from the address the app was opened at, waiting for the tree to load. */
  private pending: string[] = [];

  constructor() {
    if (typeof location === 'undefined') return;
    this.pending = this.fromAddress();
    let lastLoad = this.store.loadId();
    effect(() => {
      const load = this.store.loadId();
      untracked(() => {
        if (load === lastLoad) return;
        lastLoad = load;
        const keys = this.pending;
        this.pending = [];
        this.batches.set(new Map());
        this.keys.set(keys.length ? keys : null);
      });
    });
    window.addEventListener('popstate', () => {
      if (location.hash === PRINT_HASH) return;
      const keys = this.fromAddress();
      this.batches.set(new Map());
      this.keys.set(keys.length ? keys : null);
    });
    effect(() => {
      const keys = this.keys();
      if (this.ui.printOpen()) return;
      untracked(() => this.toAddress(keys));
    });
  }

  /** Shows one family alone; `personId` is brought into view, otherwise the whole family. */
  show(key: string, personId?: string): void {
    this.apply([key], new Map([[key, 0]]), () => this.after(personId));
  }

  /** Adds families to the ones shown, together (starting from the whole tree, they are shown alone). */
  add(add: string | readonly string[], personId?: string): void {
    const keys = this.keys() ?? [];
    const more = (typeof add === 'string' ? [add] : add).filter((k, i, all) => !keys.includes(k) && all.indexOf(k) === i);
    if (!more.length) return this.after(personId);
    const next = keys.length ? Math.max(...keys.map((k) => this.batchOf(k))) + 1 : 0;
    const batches = new Map(keys.length ? this.batches() : []);
    for (const k of more) batches.set(k, next);
    this.apply([...keys, ...more], batches, () => this.after(personId));
  }

  /** Takes families out of the view; with none left, back to the whole tree. */
  remove(remove: string | readonly string[]): void {
    const out = typeof remove === 'string' ? [remove] : remove;
    const keys = (this.keys() ?? []).filter((k) => !out.includes(k));
    const batches = new Map(this.batches());
    for (const k of out) batches.delete(k);
    this.apply(keys.length ? keys : null, batches, () => this.ui.fit(!this.chart.big()));
  }

  /** When a family came into the view (see `batches`). */
  batchOf(key: string): number {
    return this.batches().get(key) ?? (this.keys() ?? []).indexOf(key);
  }

  /** Back to the whole tree. */
  exit(): void {
    if (!this.keys()) return;
    this.apply(null, new Map(), () => this.ui.fit(!this.chart.big()));
  }

  /**
   * Switches the view, behind the busy note for a big tree (see ChartBusy): one frame to
   * paint it, then the work, and the note goes once the chart is drawn.
   */
  private apply(keys: readonly string[] | null, batches: ReadonlyMap<string, number>, then: () => void): void {
    this.ui.closeMenu();
    this.chart.run(() => {
      this.batches.set(batches);
      this.keys.set(keys);
      then();
    });
  }

  private after(personId: string | undefined): void {
    // Moves made by hand are made on the whole tree.
    if (personId) {
      this.ui.focus(personId);
      this.ui.highlight(personId);
    } else {
      this.ui.fit(!this.chart.big());
    }
  }

  private fromAddress(): string[] {
    const keys = location.hash.startsWith(FAMILY_HASH) ? decodeFamilyKeys(location.hash.slice(FAMILY_HASH.length)) : [];
    // An address kept from before the spellings of a name were united (…/nowak) still finds its family.
    const unite = unitingOf(this.store.doc().view);
    return unite.polish || unite.foreign ? keys.map((k) => unitedKey(k, unite)).filter((k, i, all) => all.indexOf(k) === i) : keys;
  }

  /**
   * Entering the view adds an entry to the history, so Back leaves it; moving
   * between families replaces it. Leaving the view replaces it too: going
   * back instead could land on an entry the print studio left (#/print) and
   * open the studio.
   */
  private toAddress(keys: readonly string[] | null): void {
    // The print studio is still taking its own entry away.
    if (location.hash === PRINT_HASH) return;
    const want = keys?.length ? FAMILY_HASH + encodeFamilyKeys(keys) : '';
    const at = location.hash.startsWith(FAMILY_HASH);
    if (want) {
      if (location.hash === want) return;
      if (at) history.replaceState(null, '', want);
      else history.pushState(null, '', want);
    } else if (at) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
}
