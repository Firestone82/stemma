import { Injectable, Injector, afterNextRender, inject, signal } from '@angular/core';
import { TreeStore } from '../core/store/tree-store';

/** Trees bigger than this take a moment to lay out again: a note says so while the chart is busy. */
const BUSY_FROM = 150;

/**
 * Changes that lay a big tree out again (another view, other settings for the
 * cards, other relatives) first show a note over the chart: one frame for it
 * to appear, then the change, and the note goes once the chart is drawn, so
 * the app says it is working instead of freezing silently.
 */
@Injectable({ providedIn: 'root' })
export class ChartBusy {
  private readonly store = inject(TreeStore);
  private readonly injector = inject(Injector);

  /** Set while a big tree is laid out again. */
  readonly busy = signal(false);

  /** A tree big enough to take a moment to lay out. */
  big(): boolean {
    return this.store.doc().people.length > BUSY_FROM;
  }

  /** Makes the change, behind the note when the tree is big; `false` when another change is still being drawn. */
  run(change: () => void): boolean {
    if (this.busy()) return false;
    if (!this.big()) {
      change();
      return true;
    }
    this.busy.set(true);
    requestAnimationFrame(() =>
      setTimeout(() => {
        try {
          change();
        } finally {
          afterNextRender(() => this.busy.set(false), { injector: this.injector });
        }
      }),
    );
    return true;
  }
}
