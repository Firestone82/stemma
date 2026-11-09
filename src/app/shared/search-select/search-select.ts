import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { normalizeQuery } from '../../core/model/names';
import { I18n } from '../../i18n/i18n';
import { Icon } from '../icon/icon';

export interface SearchOption {
  id: string;
  label: string;
  /** Shown after the label, smaller: dates, a relationship. */
  detail?: string;
}

let nextId = 0;

/**
 * A drop-down list with a search field, for choosing one of many: it looks
 * like a select, and opens a list that narrows as one types.
 */
@Component({
  selector: 'stemma-search-select',
  imports: [Icon],
  templateUrl: './search-select.html',
  styleUrl: './search-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'onDocumentPointer($event)', '(keydown.escape)': 'onEscape($event)' },
})
export class SearchSelect {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = inject(I18n).t;

  readonly inputId = input.required<string>();
  readonly options = input.required<readonly SearchOption[]>();
  readonly value = input<string>('');
  readonly disabled = input(false);
  readonly valueChange = output<string>();

  protected readonly listId = `search-select-${++nextId}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);

  protected readonly current = computed(() => this.options().find((o) => o.id === this.value()));

  protected readonly results = computed(() => {
    const q = normalizeQuery(this.query());
    const all = this.options();
    if (!q) return all;
    return all.filter((o) => normalizeQuery(`${o.label} ${o.detail ?? ''}`).includes(q));
  });

  protected readonly activeId = computed(() => (this.open() && this.results().length ? `${this.listId}-${this.active()}` : null));

  protected toggle(): void {
    if (this.open()) this.close();
    else this.show();
  }

  private show(): void {
    if (this.disabled()) return;
    this.query.set('');
    const i = this.options().findIndex((o) => o.id === this.value());
    this.active.set(Math.max(0, i));
    this.open.set(true);
    setTimeout(() => {
      const input = this.host.nativeElement.querySelector<HTMLInputElement>('input');
      input?.focus();
      this.scrollActiveIntoView();
    });
  }

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.host.nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected onButtonKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      this.show();
      event.preventDefault();
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const n = this.results().length;
    if (event.key === 'ArrowDown' && n) {
      this.active.update((i) => Math.min(n - 1, i + 1));
      this.scrollActiveIntoView();
      event.preventDefault();
    } else if (event.key === 'ArrowUp' && n) {
      this.active.update((i) => Math.max(0, i - 1));
      this.scrollActiveIntoView();
      event.preventDefault();
    } else if (event.key === 'Enter') {
      if (n) this.choose(this.results()[this.active()].id);
      event.preventDefault();
    } else if (event.key === 'Tab') {
      this.open.set(false);
    }
  }

  protected onEscape(event: Event): void {
    if (!this.open()) return;
    event.stopPropagation();
    this.close();
  }

  protected onDocumentPointer(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  protected choose(id: string): void {
    this.open.set(false);
    if (id !== this.value()) this.valueChange.emit(id);
    this.host.nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private scrollActiveIntoView(): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('li.active')?.scrollIntoView?.({ block: 'nearest' }));
  }
}
