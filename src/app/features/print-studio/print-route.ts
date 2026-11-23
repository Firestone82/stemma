import { DestroyRef, Injectable, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { DEFAULT_PRINT, PrintSettings, effectivePrint, printDefaults } from '../../core/model/types';
import { TreeStore } from '../../core/store/tree-store';
import { UiState } from '../../state/ui-state';
import { addressPatch, isPrintHash, printAddress, readPrintAddress } from './print-address';
import { PrintModel } from './print-model';

export { PRINT_HASH, isPrintHash } from './print-address';

/**
 * Kept with each of the studio's entries in the browser's history: how many entries back the one before the
 * studio is (so closing it goes back there), or null when the studio was arrived at by its address.
 */
interface PrintEntry {
  printBack: number | null;
}

/** Changes of the same settings this soon after each other (typing a title, a slider) share one entry in the history. */
const COALESCE_MS = 1200;

/**
 * Keeps the print studio and the browser's address in step. Opening the studio goes to #/print, with the person
 * the page is drawn around and the settings changed from their defaults after it (see printAddress); each change
 * of a setting is a new entry in the history, so Back and Forward go through the prints as they were, and the
 * first Back past them leaves the studio. Arriving at such an address opens the studio with those settings.
 * Started with the app.
 */
@Injectable({ providedIn: 'root' })
export class PrintRoute {
  private readonly ui = inject(UiState);
  private readonly store = inject(TreeStore);
  private readonly injector = inject(Injector);

  /** The settings an address asked for, waiting for the tree to be read. */
  private readonly pending = signal<Partial<PrintSettings> | null>(null);
  /** The next address written replaces the entry it is at (it only puts right one just arrived at). */
  private replaceNext = false;
  /** The settings the last entry was written for changed, and when: a quick change of the same ones replaces it. */
  private last?: { keys: string; at: number };

  private readonly defaults = computed<PrintSettings>(() => ({ ...DEFAULT_PRINT, ...printDefaults(this.store.doc().view) }));
  private readonly settings = computed<PrintSettings>(() => ({ ...DEFAULT_PRINT, ...effectivePrint(this.store.doc()) }));
  /** The studio's address for the open tree's print settings. */
  readonly address = computed(() => printAddress(this.settings(), this.defaults(), this.store.doc().meta.homePersonId));

  constructor() {
    if (isPrintHash(location.hash)) {
      this.ui.printOpen.set(true);
      this.pending.set(readPrintAddress(location.hash, DEFAULT_PRINT));
    }
    let lastLoad = this.store.loadId();
    effect(() => {
      const load = this.store.loadId();
      untracked(() => {
        if (load === lastLoad) return;
        lastLoad = load;
        const wanted = this.pending();
        if (!wanted) return;
        this.pending.set(null);
        if (!this.store.doc().people.length) {
          this.leaveForStart();
          return;
        }
        if (this.ui.printOpen()) this.restore(wanted);
      });
    });
    const onPopState = () => {
      this.last = undefined;
      const open = isPrintHash(location.hash);
      const wanted = open ? readPrintAddress(location.hash, this.defaults()) : null;
      // The tree is still being read: the address waits for it, as at a reload.
      if (wanted && this.ui.restoring()) {
        this.pending.set(wanted);
        this.ui.printOpen.set(true);
        return;
      }
      this.pending.set(null);
      if (wanted && !this.store.doc().people.length) {
        this.leaveForStart();
        return;
      }
      this.ui.printOpen.set(open);
      if (wanted) this.restore(wanted);
    };
    window.addEventListener('popstate', onPopState);
    // Without this a destroyed app (each test's injector) would still hear the history moving.
    inject(DestroyRef).onDestroy(() => window.removeEventListener('popstate', onPopState));
    effect(() => {
      const open = this.ui.printOpen();
      const want = this.address();
      if (this.pending()) return;
      untracked(() => this.write(open, want));
    });
  }

  /**
   * The studio's address with no tree to print (a reload once the file is no longer open, Back into a print of
   * a tree closed since): the start page instead, to open a file, and the address of the app without the
   * studio's, so opening a file goes to the editor and a reload stays on the start page.
   */
  private leaveForStart(): void {
    this.ui.printOpen.set(false);
    history.replaceState(null, '', location.pathname + location.search);
    this.last = undefined;
  }

  /**
   * The print settings as an address says, as one step that undo can take back; nothing when they are so already,
   * or when the address names no settings at all (#/print alone: the settings the tree has).
   */
  private restore(wanted: Partial<PrintSettings>): void {
    this.apply(wanted);
    // The address is put right where the tree could not do as it says, in place of the entry arrived at.
    this.replaceNext = location.hash !== this.address();
  }

  private apply(wanted: Partial<PrintSettings>): void {
    if (!Object.keys(wanted).length) return;
    const settings = this.settings();
    const defaults = this.defaults();
    const home = this.store.doc().meta.homePersonId;
    // Someone who is not in this tree is not drawn around.
    if (wanted.centerId && !this.store.index().person(wanted.centerId)) wanted = { ...wanted, centerId: settings.centerId };
    const target = { ...defaults, ...wanted } as PrintSettings;
    if (printAddress(target, defaults, home) === printAddress(settings, defaults, home)) return;
    const patch = addressPatch(settings, wanted, defaults);
    if (Object.keys(patch).length) this.injector.get(PrintModel).set(patch, 'print address');
  }

  private write(open: boolean, want: string): void {
    const at = isPrintHash(location.hash);
    if (!open) {
      if (!at) return;
      const back = (history.state as PrintEntry | null)?.printBack;
      if (back) history.go(-back);
      else history.replaceState(null, '', location.pathname + location.search);
      this.last = undefined;
      return;
    }
    // The tree the address is for is still being read.
    if (!this.store.doc().people.length) return;
    if (!at) {
      history.pushState({ printBack: 1 } satisfies PrintEntry, '', want);
      this.last = undefined;
      this.replaceNext = false;
      return;
    }
    if (location.hash === want) {
      this.replaceNext = false;
      return;
    }
    const entry = (history.state as PrintEntry | null) ?? { printBack: null };
    const keys = changedKeys(location.hash, want);
    const now = Date.now();
    const quick = !!this.last && this.last.keys === keys && now - this.last.at < COALESCE_MS;
    if (this.replaceNext || quick) {
      history.replaceState({ printBack: entry.printBack ?? null } satisfies PrintEntry, '', want);
    } else {
      history.pushState({ printBack: entry.printBack === null || entry.printBack === undefined ? null : entry.printBack + 1 } satisfies PrintEntry, '', want);
    }
    this.last = this.replaceNext ? undefined : { keys, at: now };
    this.replaceNext = false;
  }
}

/** The parameters two addresses differ in, as one text to compare. */
export function changedKeys(before: string, after: string): string {
  const query = (hash: string) => new URLSearchParams(hash.split('?')[1] ?? '');
  const a = query(before);
  const b = query(after);
  const names = new Set([...a.keys(), ...b.keys()]);
  return [...names]
    .filter((n) => a.get(n) !== b.get(n))
    .sort()
    .join(',');
}
