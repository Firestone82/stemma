import { Injectable, computed, inject, signal } from '@angular/core';
import { Notice } from '../core/model/notice';
import { TreeStore } from '../core/store/tree-store';

export type Relation = 'parent' | 'partner' | 'child' | 'sibling';

export interface AddRequest {
  relation: Relation;
  personId: string;
  /** For a child: the other parent to preselect (a person id), or null for none. */
  otherParentId?: string | null;
}

export type DialogRequest =
  | { kind: 'confirm-delete'; personId: string }
  | { kind: 'confirm-new' }
  | { kind: 'import-report'; title: string; notes: Notice[]; upgrades: Notice[] }
  | { kind: 'newer-version'; notice: Notice; xml: string; name: string }
  | { kind: 'xml'; xml: string; filename: string }
  | { kind: 'about' }
  | { kind: 'family-export' };

export type MenuName = 'file' | 'appearance' | 'relatives';

/** Peek height of the bottom sheet on phones, in pixels. */
export const SHEET_PEEK = 196;

/** UI state that is not part of the tree: open panels, menus and requests between components. */
@Injectable({ providedIn: 'root' })
export class UiState {
  private readonly store = inject(TreeStore);

  readonly adding = signal<AddRequest | null>(null);
  readonly dialog = signal<DialogRequest | null>(null);
  readonly menu = signal<MenuName | null>(null);
  /** The print and export studio is open. */
  readonly printOpen = signal(false);
  /**
   * People left out of the print at hand by a click on their card or on a line, in the
   * order they were clicked. Not saved; cleared when the studio closes or another tree is opened.
   */
  readonly printOmitted = signal<readonly string[]>([]);
  /**
   * Each click that left people out, oldest first: how many, and how many steps of the tree's own undo there
   * were then, so that undoing in the print studio goes back through both in the order things were done.
   */
  private readonly omitSteps = signal<readonly { count: number; depth: number }[]>([]);
  /** What undo brought back, for redo to leave out again. */
  private readonly omitRedo = signal<readonly { ids: readonly string[]; depth: number }[]>([]);

  /** Leaves people out of the print, as one step. */
  omitFromPrint(ids: readonly string[]): void {
    const fresh = ids.filter((id) => !this.printOmitted().includes(id));
    if (!fresh.length) return;
    this.printOmitted.update((all) => [...all, ...fresh]);
    this.omitSteps.update((steps) => [...steps, { count: fresh.length, depth: this.store.undoDepth() }]);
    this.omitRedo.set([]);
  }

  /**
   * People brought back onto the print (from a card's menu): no longer left out. Each click that left people
   * out keeps the others it left out, for undo.
   */
  keepInPrint(ids: readonly string[]): void {
    const keep = new Set(ids);
    const all = this.printOmitted();
    if (!all.some((id) => keep.has(id))) return;
    let at = 0;
    const steps = this.omitSteps().map((step) => {
      const ids = all.slice(at, at + step.count);
      at += step.count;
      return { ...step, count: ids.filter((id) => !keep.has(id)).length };
    });
    this.printOmitted.set(all.filter((id) => !keep.has(id)));
    this.omitSteps.set(steps.filter((step) => step.count > 0));
    this.omitRedo.set([]);
  }

  /** Everyone back in the print; nothing left to undo or redo there. */
  clearPrintOmitted(): void {
    this.printOmitted.set([]);
    this.omitSteps.set([]);
    this.omitRedo.set([]);
  }

  /** A setting of the print was changed: what was brought back before it cannot be left out again by redo. */
  printEdited(): void {
    this.omitRedo.set([]);
  }

  /** Whether the last thing done in the print studio was leaving people out (and not a change the tree's undo keeps). */
  private omitIsLast(): boolean {
    const last = this.omitSteps().at(-1);
    return !!last && (this.store.undoDepth() <= last.depth || !this.store.canUndo());
  }

  /** Whether redo in the print studio leaves people out again (and does not redo a change the tree's undo keeps). */
  private omitIsNext(): boolean {
    const next = this.omitRedo().at(-1);
    return !!next && !(this.store.canRedo() && this.store.undoDepth() < next.depth);
  }

  readonly canUndoInPrint = computed(() => this.omitSteps().length > 0 || this.store.canUndo());
  readonly canRedoInPrint = computed(() => this.omitRedo().length > 0 || this.store.canRedo());

  /** Undo in the print studio: the last thing done there, a click that left people out or a change to the page. */
  undoInPrint(): void {
    if (!this.omitIsLast()) {
      if (this.store.canUndo()) this.store.undo();
      return;
    }
    const steps = this.omitSteps();
    const all = this.printOmitted();
    const last = steps[steps.length - 1];
    const count = Math.min(all.length, last.count);
    this.omitRedo.update((redo) => [...redo, { ids: all.slice(all.length - count), depth: last.depth }]);
    this.printOmitted.set(all.slice(0, all.length - count));
    this.omitSteps.set(steps.slice(0, -1));
  }

  /** Redo in the print studio: what the last undo there took back. */
  redoInPrint(): void {
    if (!this.omitIsNext()) {
      if (this.store.canRedo()) this.store.redo();
      return;
    }
    const redo = this.omitRedo();
    const again = redo[redo.length - 1];
    const fresh = again.ids.filter((id) => !this.printOmitted().includes(id));
    this.printOmitted.update((all) => [...all, ...fresh]);
    this.omitSteps.update((steps) => [...steps, { count: fresh.length, depth: again.depth }]);
    this.omitRedo.set(redo.slice(0, -1));
  }

  /** On small screens: the people list sheet. */
  readonly peopleOpen = signal(false);
  /** On small screens: whether the person sheet is pulled up. */
  readonly sheetExpanded = signal(false);
  /** The tree from the last visit is still being read (a big one, from IndexedDB). */
  readonly restoring = signal(false);
  /** The example family is showing and the note about it has not been dismissed. */
  readonly showSampleNote = signal(false);
  /** Family groups in the people list opened or closed by hand, by family key. */
  readonly familyOpen = signal<ReadonlyMap<string, boolean>>(new Map());

  /** Requests for the chart: centre on a person, or fit everything in view. */
  readonly focusRequest = signal<{ personId: string; seq: number } | null>(null);
  /** Bring a person and their partner to the middle of the chart. */
  readonly centreRequest = signal<{ personId: string; seq: number } | null>(null);
  /** Bring a family (its partners and children) to the middle of the chart. */
  readonly familyRequest = signal<{ familyId: string; seq: number } | null>(null);
  readonly fitRequest = signal(0);
  /** A person to briefly highlight after they were added. */
  readonly flash = signal<{ personId: string; seq: number } | null>(null);
  /** The field to focus when the person panel opens next. */
  readonly focusField = signal<string | null>(null);
  /** Ctrl+F asked for the search field of the people list; the list focuses it once it is showing. */
  readonly findRequested = signal(false);
  /** Phone-sized screen: the panel becomes a bottom sheet. */
  readonly narrow = signal(false);
  readonly viewportHeight = signal(typeof innerHeight === 'number' ? innerHeight : 800);

  /** The people list has a search field: only once there are more people than fit at a glance. */
  readonly peopleSearchable = computed(() => this.store.doc().people.length > 6);

  /** The panel is showing (always on wide screens; on phones when there is something in it). */
  readonly sheetOpen = computed(() => !this.narrow() || !!this.adding() || !!this.store.selection() || this.peopleOpen());
  /** On phones: the sheet is pulled up to most of the screen. */
  readonly sheetFull = computed(() => this.narrow() && (this.sheetExpanded() || !!this.adding() || (this.peopleOpen() && !this.store.selection())));
  /** How much of the chart the bottom sheet covers on phones. */
  readonly chartInsetBottom = computed(() => {
    if (!this.narrow() || !this.sheetOpen()) return 0;
    return this.sheetFull() ? Math.round((this.viewportHeight() - 52) * 0.82) : SHEET_PEEK;
  });

  private seq = 0;

  constructor() {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(max-width: 860px)');
    this.narrow.set(mq.matches);
    mq.addEventListener('change', (e) => this.narrow.set(e.matches));
    window.addEventListener('resize', () => this.viewportHeight.set(window.innerHeight));
  }

  focus(personId: string): void {
    this.focusRequest.set({ personId, seq: ++this.seq });
  }

  centre(personId: string): void {
    this.centreRequest.set({ personId, seq: ++this.seq });
  }

  centreFamily(familyId: string): void {
    this.familyRequest.set({ familyId, seq: ++this.seq });
  }

  /** Whether the last fit asked for glides there; a big tree jumps, as gliding would redraw it every frame. */
  fitAnimated = true;

  fit(animate = true): void {
    this.fitAnimated = animate;
    this.fitRequest.update((v) => v + 1);
  }

  highlight(personId: string): void {
    this.flash.set({ personId, seq: ++this.seq });
  }

  /** Back to the tree overview (on phones, the list of people). */
  showOverview(): void {
    this.closeMenu();
    this.adding.set(null);
    this.store.selection.set(null);
    if (this.narrow()) this.peopleOpen.set(true);
  }

  /** Ctrl+F: back to the overview, with the search field of the people list focused. */
  find(): void {
    this.showOverview();
    this.findRequested.set(true);
  }

  togglePeople(): void {
    this.closeMenu();
    this.adding.set(null);
    this.store.selection.set(null);
    this.peopleOpen.set(!this.peopleOpen());
  }

  toggleMenu(menu: MenuName): void {
    this.menu.set(this.menu() === menu ? null : menu);
  }

  closeMenu(): void {
    this.menu.set(null);
  }
}
