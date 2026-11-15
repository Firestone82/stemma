import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';

/**
 * The page as it will print, on a light table. The SVG is placed in the page
 * itself, so it uses the fonts the app has already loaded. A button opens it
 * in a window of its own. The preview can be zoomed into for a closer look
 * (the wheel, a double click, the buttons) and dragged about while zoomed;
 * that changes nothing on the print.
 */
@Component({
  selector: 'stemma-print-preview',
  imports: [Icon],
  templateUrl: './print-preview.html',
  styleUrl: './print-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', '[attr.aria-label]': "t('print.preview')" },
})
export class PrintPreview {
  protected readonly t = inject(I18n).t;

  /** The page as SVG markup, or null while it is being prepared. */
  readonly svg = input<string | null>(null);
  readonly width = input(0);
  readonly height = input(0);
  readonly summary = input('');
  readonly note = input<{ warn: boolean; text: string } | null>(null);
  /** Whether the page can have a window of its own here. */
  readonly canPopOut = input(false);
  /** The browser did not open that window. */
  readonly popOutFailed = input(false);
  readonly popOut = output<void>();
  /** A card was clicked: the person's id. */
  readonly pick = output<string>();
  /** People left out of this print by clicking, if any, with how to bring them back. */
  readonly omitted = input(0);
  readonly restore = output<void>();

  protected readonly maxZoom = MAX_ZOOM;
  /** The closer look: the page `k` times bigger, moved by `x`, `y` pixels of the sheet. */
  protected readonly zoom = signal({ k: 1, x: 0, y: 0 });
  protected readonly zoomPercent = computed(() => Math.round(this.zoom().k * 100));
  protected readonly lensTransform = computed(() => {
    const z = this.zoom();
    return z.k === 1 ? 'none' : `translate(${z.x}px, ${z.y}px) scale(${z.k})`;
  });
  protected readonly panning = signal(false);
  private drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  /** Set when a drag has just ended, so its click does not leave anyone out. */
  private dragged = false;

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
  }

  protected onDoubleClick(event: MouseEvent): void {
    if (this.zoom().k > 1) this.resetZoom();
    else this.zoomAt(2.5, event.clientX, event.clientY);
  }

  /** Zoom from the buttons: around the middle of the sheet. */
  protected zoomBy(factor: number): void {
    const box = this.sheetBox();
    if (box) this.zoomAt(factor, box.left + box.width / 2, box.top + box.height / 2);
  }

  /** Whether the preview is zoomed in: Escape then goes back to the whole page (see PrintStudio). */
  zoomedIn(): boolean {
    return this.zoom().k > 1;
  }

  resetZoom(): void {
    this.zoom.set({ k: 1, x: 0, y: 0 });
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.zoom().k <= 1 || event.button !== 0) return;
    event.preventDefault();
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }

  protected onPointerMove(event: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) {
      d.moved = true;
      this.panning.set(true);
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }
    d.x = event.clientX;
    d.y = event.clientY;
    const z = this.zoom();
    this.zoom.set(this.clamp({ k: z.k, x: z.x + dx, y: z.y + dy }));
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.drag?.id !== event.pointerId) return;
    this.dragged = this.drag.moved;
    this.drag = null;
    this.panning.set(false);
  }

  /** Zooms by `factor` keeping the point under (`cx`, `cy`) on screen still. */
  private zoomAt(factor: number, cx: number, cy: number): void {
    const box = this.sheetBox();
    if (!box) return;
    const z = this.zoom();
    const k = Math.min(MAX_ZOOM, Math.max(1, z.k * factor));
    if (k === 1) return this.resetZoom();
    const px = cx - box.left;
    const py = cy - box.top;
    // The page point under the pointer stays under it.
    const x = px - ((px - z.x) / z.k) * k;
    const y = py - ((py - z.y) / z.k) * k;
    this.zoom.set(this.clamp({ k, x, y }));
  }

  /** Keeps the zoomed page covering the sheet: no empty edge comes into view. */
  private clamp(z: { k: number; x: number; y: number }): { k: number; x: number; y: number } {
    const box = this.sheetBox();
    if (!box) return z;
    return { k: z.k, x: Math.min(0, Math.max(box.width - box.width * z.k, z.x)), y: Math.min(0, Math.max(box.height - box.height * z.k, z.y)) };
  }

  private sheetBox(): DOMRect | undefined {
    return this.sheet()?.nativeElement.parentElement?.getBoundingClientRect();
  }

  /** Which card a click landed on, if any. */
  protected onClick(event: Event): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    const card = (event.target as Element | null)?.closest<SVGGElement>('[data-person]');
    const id = card?.dataset['person'];
    if (id) this.pick.emit(id);
  }

  private readonly sheet = viewChild<ElementRef<HTMLDivElement>>('sheet');
  /** Width divided by height of the page, for sizing the sheet. */
  protected readonly ratio = computed(() => (this.width() && this.height() ? this.width() / this.height() : 1.414));

  constructor() {
    effect(() => {
      const svg = this.svg();
      const host = this.sheet()?.nativeElement;
      if (host) host.innerHTML = svg ?? '';
    });
    // Another paper or orientation is another page: back to the whole of it.
    effect(() => {
      this.ratio();
      untracked(() => this.resetZoom());
    });
  }
}

/** How far the preview zooms in. */
const MAX_ZOOM = 8;
