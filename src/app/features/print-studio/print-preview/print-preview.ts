import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { LegendBox } from '../../../core/model/types';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';

/**
 * The page as it will print, on a light table. The SVG is placed in the page
 * itself, so it uses the fonts the app has already loaded. A button opens it
 * in a window of its own. The preview can be zoomed into for a closer look
 * (the wheel, a double click, the buttons) and dragged about while zoomed;
 * that changes nothing on the print. The families' names sit in a box that
 * can be dragged elsewhere on the page and resized by its corners; the names
 * are fitted to it.
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
  /** The page is being drawn again: a note over the one shown before (see PrintModel.drawing). */
  readonly drawing = input(false);
  readonly restore = output<void>();
  /** Where the families' names are, as shares of the page (see PosterResult.legend). */
  readonly legend = input<(LegendBox & { free: boolean }) | null>(null);
  /** The names' box moved or resized by hand; null to put them back where the style has them. */
  readonly legendMove = output<LegendBox | null>();

  protected readonly corners = ['nw', 'ne', 'sw', 'se'] as const;
  /** The box while it is being dragged, before the page is drawn again with it. */
  private readonly boxDraft = signal<LegendBox | null>(null);
  protected readonly legendShown = computed(() => {
    const draft = this.boxDraft();
    const at = this.legend();
    return draft ? { ...draft, free: true } : at;
  });
  protected boxDrag: { id: number; what: 'move' | Corner; x: number; y: number; start: LegendBox; moved: boolean } | null = null;

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

  protected onBoxDown(event: PointerEvent, what: 'move' | Corner): void {
    const at = this.legend();
    if (event.button !== 0 || !at || this.boxDrag) return;
    event.stopPropagation();
    event.preventDefault();
    const box = event.currentTarget instanceof HTMLElement ? event.currentTarget.closest('.legend-box') : null;
    box?.setPointerCapture(event.pointerId);
    this.boxDrag = { id: event.pointerId, what, x: event.clientX, y: event.clientY, start: { x: at.x, y: at.y, w: at.w, h: at.h }, moved: false };
  }

  protected onBoxMove(event: PointerEvent): void {
    const d = this.boxDrag;
    const sheet = this.sheetBox();
    if (!d || d.id !== event.pointerId || !sheet) return;
    event.stopPropagation();
    // Pointer travel as shares of the page, however far it is zoomed in.
    const k = this.zoom().k;
    const dx = (event.clientX - d.x) / (sheet.width * k);
    const dy = (event.clientY - d.y) / (sheet.height * k);
    if (!d.moved && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 3) return;
    d.moved = true;
    this.boxDraft.set(movedBox(d.start, d.what, dx, dy));
  }

  protected onBoxUp(event: PointerEvent): void {
    const d = this.boxDrag;
    if (!d || d.id !== event.pointerId) return;
    event.stopPropagation();
    this.boxDrag = null;
    const draft = this.boxDraft();
    if (d.moved && draft) this.legendMove.emit(draft);
    else this.boxDraft.set(null);
  }

  /** Arrow keys move the box a little; with Shift they make it bigger or smaller. */
  protected onBoxKey(event: KeyboardEvent): void {
    const at = this.legend();
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!at || !step) return;
    event.preventDefault();
    event.stopPropagation();
    const d = 0.01;
    const start = { x: at.x, y: at.y, w: at.w, h: at.h };
    this.legendMove.emit(movedBox(start, event.shiftKey ? 'se' : 'move', step[0] * d, step[1] * d));
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
    return this.sheet()?.nativeElement.parentElement?.parentElement?.getBoundingClientRect();
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
      // The page drawn with the box where it was dropped: the box follows the page again.
      untracked(() => {
        if (!this.boxDrag) this.boxDraft.set(null);
      });
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

type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** The smallest the names' box can be made, as a share of the page. */
const MIN_BOX = 0.04;

/** `start` moved, or one corner of it dragged, by `dx`, `dy` (shares of the page), kept on the page. */
export function movedBox(start: LegendBox, what: 'move' | Corner, dx: number, dy: number): LegendBox {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  if (what === 'move') return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
  let { x, y } = start;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (what === 'nw' || what === 'sw') x = clamp(x + dx, 0, right - MIN_BOX);
  else right = clamp(right + dx, x + MIN_BOX, 1);
  if (what === 'nw' || what === 'ne') y = clamp(y + dy, 0, bottom - MIN_BOX);
  else bottom = clamp(bottom + dy, y + MIN_BOX, 1);
  return { x, y, w: right - x, h: bottom - y };
}
