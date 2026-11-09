import { Injectable, effect, inject, untracked } from '@angular/core';
import { UiState } from '../../state/ui-state';

/** The address of the print studio: the app's address with this after it. */
export const PRINT_HASH = '#/print';

/**
 * Keeps the print studio and the browser's address in step: opening the
 * studio goes to #/print (a new entry in the history, so Back leaves it), and
 * arriving at that address opens the studio. Started with the app.
 */
@Injectable({ providedIn: 'root' })
export class PrintRoute {
  private readonly ui = inject(UiState);
  /** Whether the current #/print entry is one the studio pushed, which Back can undo. */
  private pushed = false;

  constructor() {
    if (location.hash === PRINT_HASH) this.ui.printOpen.set(true);
    window.addEventListener('popstate', () => {
      this.pushed = false;
      this.ui.printOpen.set(location.hash === PRINT_HASH);
    });
    effect(() => {
      const open = this.ui.printOpen();
      untracked(() => {
        const at = location.hash === PRINT_HASH;
        if (open && !at) {
          history.pushState(null, '', PRINT_HASH);
          this.pushed = true;
        } else if (!open && at) {
          if (this.pushed) history.back();
          else history.replaceState(null, '', location.pathname + location.search);
          this.pushed = false;
        }
      });
    });
  }
}
