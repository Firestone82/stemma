import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../../shared/icon/icon';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  /** A destructive action, drawn in the warning colour. */
  danger?: boolean;
  /** A rule above this item. */
  separated?: boolean;
}

/**
 * The menu that opens on a right click (or a long press) on the chart, at the
 * pointer. Kept inside the chart: it moves in from the edges when it would
 * not fit. Arrow keys move between the actions, Escape closes.
 */
@Component({
  selector: 'stemma-context-menu',
  imports: [Icon],
  templateUrl: './context-menu.html',
  styleUrl: './context-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'menu',
    class: 'menu',
    '[style.left.px]': 'left()',
    '[style.top.px]': 'top()',
    '[attr.aria-label]': 'title()',
    '(keydown)': 'onKey($event)',
    '(document:pointerdown)': 'onDocumentPointer($event)',
    '(document:keydown.escape)': 'dismiss.emit()',
    '(window:resize)': 'dismiss.emit()',
    '(document:wheel)': 'dismiss.emit()',
    '(contextmenu)': '$event.preventDefault()',
  },
})
export class ContextMenu implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Where the pointer was, relative to the chart. */
  readonly x = input.required<number>();
  readonly y = input.required<number>();
  readonly title = input('');
  readonly items = input.required<readonly ContextMenuItem[]>();
  readonly pick = output<string>();
  readonly dismiss = output<void>();

  protected readonly left = signal(0);
  protected readonly top = signal(0);

  ngAfterViewInit(): void {
    const el = this.host.nativeElement;
    const room = el.offsetParent as HTMLElement | null;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const maxX = (room?.clientWidth ?? Infinity) - w - 8;
    const maxY = (room?.clientHeight ?? Infinity) - h - 8;
    this.left.set(Math.max(8, Math.min(this.x(), maxX)));
    this.top.set(Math.max(8, Math.min(this.y(), maxY)));
    setTimeout(() => el.querySelector<HTMLButtonElement>('button')?.focus());
  }

  protected choose(id: string): void {
    this.pick.emit(id);
  }

  protected onKey(event: KeyboardEvent): void {
    const buttons = [...this.host.nativeElement.querySelectorAll<HTMLButtonElement>('button')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') buttons[(i + 1) % buttons.length]?.focus();
    else if (event.key === 'ArrowUp') buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    else if (event.key === 'Home') buttons[0]?.focus();
    else if (event.key === 'End') buttons[buttons.length - 1]?.focus();
    else if (event.key === 'Tab') this.dismiss.emit();
    else return;
    event.preventDefault();
  }

  protected onDocumentPointer(event: Event): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.dismiss.emit();
  }
}
