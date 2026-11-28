import { Injectable, computed, inject, signal } from '@angular/core';
import { TreeStore } from '../core/store/tree-store';
import { ChartBusy } from './chart-busy';
import { Preferences } from './preferences';
import { UiState } from './ui-state';

interface Opened {
  /** The tree and the person in the middle these were opened for: centring on someone else starts afresh. */
  load: number;
  centre: string | undefined;
  /** The ancestor whose line goes on up (see core/model/focused-view). */
  through?: string;
  /** People opened from balloons. */
  people: ReadonlySet<string>;
}

/**
 * The focused view of the whole tree (see core/model/focused-view): off by
 * default, and kept on or off in this browser. What has been opened from the
 * balloons is not saved; it goes when the tree is centred on someone else, or
 * another tree is opened.
 */
@Injectable({ providedIn: 'root' })
export class FocusedView {
  private readonly store = inject(TreeStore);
  private readonly ui = inject(UiState);
  private readonly chart = inject(ChartBusy);
  private readonly prefs = inject(Preferences);

  readonly on = signal(!!this.prefs.read().focusedView);

  private readonly opened = signal<Opened | null>(null);

  /** What has been opened around the person in the middle now. */
  readonly current = computed(() => {
    const o = this.opened();
    return o && o.load === this.store.loadId() && o.centre === this.store.doc().meta.homePersonId ? o : null;
  });
  readonly through = computed(() => this.current()?.through);
  readonly people = computed<ReadonlySet<string>>(() => this.current()?.people ?? NOBODY);

  toggle(): void {
    const on = !this.on();
    this.ui.closeMenu();
    this.chart.run(() => {
      this.opened.set(null);
      this.on.set(on);
      this.prefs.set({ focusedView: on });
      this.ui.fit(!this.chart.big());
    });
  }

  /** Lets the line of ancestors go on up through `personId` instead; the line that went up before is folded away. */
  swap(personId: string, show?: string): void {
    this.change({ through: personId, people: NOBODY }, show);
  }

  /** Brings people onto the chart, with their partners. */
  open(people: readonly string[], show?: string): void {
    const now = this.people();
    this.change({ through: this.through(), people: new Set([...now, ...people]) }, show);
  }

  private change(next: Pick<Opened, 'through' | 'people'>, show: string | undefined): void {
    this.ui.closeMenu();
    this.chart.run(() => {
      this.opened.set({ load: this.store.loadId(), centre: this.store.doc().meta.homePersonId, ...next });
      if (show) {
        this.ui.focus(show);
        this.ui.highlight(show);
      }
    });
  }
}

const NOBODY: ReadonlySet<string> = new Set();
