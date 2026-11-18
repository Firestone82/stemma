import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { normalizeQuery } from '../../core/model/names';

export interface Suggestion {
  id: string;
  label: string;
  /** Shown after the label, smaller: whose it is. */
  detail?: string;
}

let nextId = 0;

/**
 * A text field that suggests what to write: typing shows the suggestions that match, the arrow beside it shows
 * them all, and whatever is written stays as it is. A suggestion is taken only when it is clicked, or reached
 * with the arrow keys and taken with Enter; one that merely matches what is typed is never filled in.
 */
@Component({
  selector: 'stemma-suggest-field',
  templateUrl: './suggest-field.html',
  styleUrl: './suggest-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'onDocumentPointer($event)' },
})
export class SuggestField {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly inputId = input.required<string>();
  /** The text written in. */
  readonly value = input('');
  readonly placeholder = input('');
  /** The field's tooltip. */
  readonly hint = input('');
  readonly suggestions = input.required<readonly Suggestion[]>();
  /** The suggestion the field stands for now, marked in the list. */
  readonly current = input('');
  /** Name of the arrow that shows the list, for screen readers. */
  readonly listLabel = input('');

  /** The text, at every keystroke. */
  readonly textChange = output<string>();
  /** The text, when the field is left after a change. */
  readonly textCommit = output<string>();
  /** A suggestion taken, by id. */
  readonly pick = output<string>();

  protected readonly listId = `suggest-field-${++nextId}`;
  protected readonly open = signal(false);
  /** What the list is narrowed to: what was typed, or nothing when the arrow opened it. */
  private readonly query = signal('');
  /** The suggestion reached with the arrow keys or pointed at; -1 for none, when Enter keeps what is written. */
  protected readonly active = signal(-1);

  protected readonly shown = computed(() => {
    const q = normalizeQuery(this.query());
    return q ? this.suggestions().filter((s) => normalizeQuery(s.label).includes(q)) : this.suggestions();
  });

  protected readonly activeId = computed(() => (this.open() && this.active() >= 0 ? `${this.listId}-${this.active()}` : null));

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.query.set(text);
    this.active.set(-1);
    // Only what matches, once something is written: nothing stands over a name of one's own.
    this.open.set(!!normalizeQuery(text) && this.shown().length > 0);
    this.textChange.emit(text);
  }

  protected onChange(event: Event): void {
    this.textCommit.emit((event.target as HTMLInputElement).value);
  }

  /** The arrow: every suggestion, or the list closed again. */
  protected toggle(): void {
    if (this.open()) this.open.set(false);
    else this.showAll();
    this.field()?.focus();
  }

  private showAll(): void {
    this.query.set('');
    this.active.set(this.suggestions().findIndex((s) => s.id === this.current()));
    this.open.set(this.suggestions().length > 0);
    this.scrollActiveIntoView();
  }

  protected onKey(event: KeyboardEvent): void {
    const n = this.shown().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) {
        this.showAll();
        return;
      }
      if (!n) return;
      const down = event.key === 'ArrowDown';
      this.active.update((i) => (i < 0 ? (down ? 0 : n - 1) : down ? Math.min(n - 1, i + 1) : Math.max(0, i - 1)));
      this.scrollActiveIntoView();
    } else if (event.key === 'Enter') {
      if (!this.open()) return;
      event.preventDefault();
      const s = this.shown()[this.active()];
      if (s) this.choose(s.id);
      else this.open.set(false);
    } else if (event.key === 'Escape') {
      if (!this.open()) return;
      event.preventDefault();
      event.stopPropagation();
      this.open.set(false);
    } else if (event.key === 'Tab') {
      this.open.set(false);
    }
  }

  protected choose(id: string): void {
    this.open.set(false);
    this.active.set(-1);
    this.query.set('');
    this.pick.emit(id);
    this.field()?.focus();
  }

  protected onDocumentPointer(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  private field(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector('input');
  }

  private scrollActiveIntoView(): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('li.active')?.scrollIntoView?.({ block: 'nearest' }));
  }
}
