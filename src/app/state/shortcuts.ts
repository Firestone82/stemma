import { Injectable, Injector, inject } from '@angular/core';
import { TreeStore } from '../core/store/tree-store';
import { PrintModel } from '../features/print-studio/print-model';
import { DocumentActions } from './document-actions';
import { PersonActions } from './person-actions';
import { UiState } from './ui-state';

/** Keyboard shortcuts for the whole app; the chart has its own for moving around. */
@Injectable({ providedIn: 'root' })
export class Shortcuts {
  private readonly store = inject(TreeStore);
  private readonly ui = inject(UiState);
  private readonly documents = inject(DocumentActions);
  private readonly people = inject(PersonActions);
  private readonly injector = inject(Injector);

  handle(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target as HTMLElement | null;
    const typing = !!target?.closest('input, textarea, select, [contenteditable="true"]');
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      this.redo();
    } else if (mod && key === 's') {
      e.preventDefault();
      // In the print studio, Ctrl+S keeps the print for the couple in the middle (the file is saved as usual with Shift).
      if (this.ui.printOpen() && !e.shiftKey && !this.ui.dialog()) this.injector.get(PrintModel).saveShortcut();
      else if (e.shiftKey) void this.documents.saveXmlAs();
      else void this.documents.saveXml();
    } else if (mod && key === 'n' && !e.shiftKey) {
      // A new tree, after a warning when the tree has anyone in it (DocumentActions.newTree). Not from the print
      // studio, nor over a dialog. (A browser tab may keep Ctrl+N for a new window; the installed app has it.)
      e.preventDefault();
      if (!this.ui.printOpen() && !this.ui.dialog()) this.documents.newTree();
    } else if (mod && key === 'o') {
      e.preventDefault();
      void this.documents.openFile();
    } else if (mod && key === 'p') {
      e.preventDefault();
      this.documents.openPrint();
    } else if (mod && key === 'f' && !e.shiftKey && !e.altKey) {
      // The people list's own search instead of the browser's find bar. The browser keeps Ctrl+F where the app has
      // no search to offer: a small tree (no search field), the print studio, a dialog, or a relative being added.
      if (this.ui.peopleSearchable() && !this.ui.printOpen() && !this.ui.dialog() && !this.ui.adding()) {
        e.preventDefault();
        this.ui.find();
      }
    } else if (e.key === 'Escape') {
      this.escape();
    } else if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
      const person = this.store.selectedPerson();
      if (person && !this.ui.dialog()) {
        e.preventDefault();
        this.people.askDelete(person.id);
      }
    }
  }

  /** In the print studio, people clicked away and changes to the page are undone in the order they were done. */
  private undo(): void {
    if (this.ui.printOpen()) this.ui.undoInPrint();
    else this.people.undo();
  }

  private redo(): void {
    if (this.ui.printOpen()) this.ui.redoInPrint();
    else this.people.redo();
  }

  /** Escape closes the innermost thing that is open. Dialogs close themselves. */
  private escape(): void {
    if (this.ui.dialog() || this.ui.printOpen()) return;
    if (this.ui.menu()) this.ui.closeMenu();
    else if (this.ui.adding()) this.ui.adding.set(null);
    else if (this.ui.sheetExpanded() && this.ui.narrow()) this.ui.sheetExpanded.set(false);
    else if (this.store.selection()) this.store.selection.set(null);
    else this.ui.peopleOpen.set(false);
  }

  /** A click outside an open menu closes it. */
  pointer(e: PointerEvent): void {
    if (!this.ui.menu()) return;
    const target = e.target as HTMLElement | null;
    if (!target?.closest('.menu-anchor')) this.ui.closeMenu();
  }
}
