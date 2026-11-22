import { computed, signal } from '@angular/core';
import { ChartViewport, View, clampZoom } from './viewport';

const DRAG_THRESHOLD = 5;
/** How long after the last wheel or touchpad event a scroll or zoom counts as over. */
const WHEEL_END = 140;

type Gesture =
  | { kind: 'pan'; id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'pinch'; d0: number; k0: number; mx: number; my: number; vx: number; vy: number };

/**
 * Dragging, pinching and wheel zooming on the chart. A drag that moved does not
 * count as a click, so letting go over a card does not select it.
 *
 * While the chart is moved, the view it is moved to is only shown (`show`): the picture the chart was drawn as
 * is slid and scaled, as a canvas would be, and nothing on the page is worked out or drawn again. The view is
 * set once the move ends, and the chart drawn again only if the zoom changed (or, during a long zoom, when the
 * picture has grown or shrunk too far to look sharp).
 */
export class ChartGestures {
  readonly panning = signal(false);
  /** Scrolled or zoomed with a wheel or a touchpad a moment ago. */
  private readonly wheeling = signal(false);
  /** The person is moving the chart about. */
  readonly moving = computed(() => this.panning() || this.wheeling());
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;
  private suppressClick = false;
  /** Where the chart is being moved to, not set on the viewport yet. */
  private live: View | null = null;
  private frameId: number | null = null;
  private wheelEnd: ReturnType<typeof setTimeout> | null = null;
  /** Where the frame stands on the page, measured once a move: measuring it at every event would make the browser work the page out again after each frame. */
  private frameRect: DOMRect | null = null;

  constructor(
    private readonly viewport: ChartViewport,
    private readonly surface: () => Element,
    /** Called when the person moves the chart themselves. */
    private readonly onUserMove: () => void,
    /** The element whose corner screen points are measured from (the surface can stand out beyond it). */
    private readonly frame: () => Element = surface,
    /**
     * Shows the chart at a view without drawing it again; whether the picture still covers the screen there.
     * Where it does not, the view is set and the chart drawn at it.
     */
    private readonly show: (view: View) => boolean = () => false,
  ) {}

  /** True (once) when the click that follows a drag should be ignored. */
  swallowClick(): boolean {
    if (!this.suppressClick) return false;
    this.suppressClick = false;
    return true;
  }

  /** The view as the person sees it: where it is being moved to, while it is. */
  current(): View {
    return this.live ?? this.viewport.view();
  }

  down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.viewport.stop();
    this.stopWheeling();
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const v = this.current();
    if (this.pointers.size === 1) {
      this.gesture = { kind: 'pan', id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: v.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: v.x, vy: v.y };
      this.capture(e.pointerId);
      this.start();
    }
  }

  move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    const g = this.gesture;
    if (!p || !g) return;
    Object.assign(p, this.local(e));
    if (g.kind === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const k = clampZoom((g.k0 * (Math.hypot(a.x - b.x, a.y - b.y) || 1)) / g.d0);
      const wx = (g.mx - g.vx) / g.k0;
      const wy = (g.my - g.vy) / g.k0;
      this.preview({ x: (a.x + b.x) / 2 - wx * k, y: (a.y + b.y) / 2 - wy * k, k });
      return;
    }
    if (g.kind === 'pan' && g.id === e.pointerId) {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        g.moved = true;
        this.capture(e.pointerId);
        this.start();
      }
      if (g.moved) this.preview({ x: g.vx + dx, y: g.vy + dy, k: this.current().k });
    }
  }

  up(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (g && (g.kind === 'pinch' || g.moved)) {
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false), 50);
    }
    if (this.pointers.size === 1 && g?.kind === 'pinch') {
      // Lifting one finger of a pinch carries on as a drag with the other.
      const [id, p] = [...this.pointers.entries()][0];
      const rect = this.rect();
      const v: View = this.current();
      this.gesture = { kind: 'pan', id, sx: p.x + rect.left, sy: p.y + rect.top, vx: v.x, vy: v.y, moved: true };
      return;
    }
    if (!this.pointers.size) {
      this.gesture = null;
      this.frameRect = null;
      this.settle();
      this.panning.set(false);
    }
  }

  /** Scrolling pans; a mouse wheel, Ctrl+scroll and trackpad pinch zoom. */
  wheel(e: WheelEvent): void {
    e.preventDefault();
    this.viewport.stop();
    if (!this.wheeling()) {
      this.wheeling.set(true);
      this.onUserMove();
    }
    const { x: px, y: py } = this.local(e);
    const lineScale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * lineScale;
    const dy = e.deltaY * lineScale;
    const mouseWheel = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy));
    const v = this.current();
    let next: View;
    if (e.ctrlKey || e.metaKey || mouseWheel) {
      const k = clampZoom(v.k * Math.exp(-dy * (e.ctrlKey || e.metaKey ? 0.01 : 0.0016)));
      next = { x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k, k };
    } else next = { ...v, x: v.x - dx, y: v.y - dy };
    this.preview(next);
    if (this.wheelEnd) clearTimeout(this.wheelEnd);
    this.wheelEnd = setTimeout(() => this.stopWheeling(), WHEEL_END);
  }

  /** A scroll or zoom with the wheel or touchpad is over: by the clock, or because the pointer moved or pressed. */
  stopWheeling(): void {
    if (this.wheelEnd) clearTimeout(this.wheelEnd);
    this.wheelEnd = null;
    if (!this.wheeling() || this.gesture) return;
    this.frameRect = null;
    this.settle();
    this.wheeling.set(false);
  }

  /** Shows the chart at `view`, once a frame however many events come in it. */
  private preview(view: View): void {
    this.live = view;
    if (this.frameId === null)
      this.frameId = requestAnimationFrame(() => {
        this.frameId = null;
        if (this.live && !this.show(this.live)) this.viewport.set(this.live);
      });
  }

  /** The move is over: the view is set where it was moved to, and the chart drawn there. */
  private settle(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    const v = this.live;
    this.live = null;
    if (v) this.viewport.set(v);
  }

  private start(): void {
    this.panning.set(true);
    this.onUserMove();
  }

  private rect(): DOMRect {
    return (this.frameRect ??= this.frame().getBoundingClientRect());
  }

  private local(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.rect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private capture(pointerId: number): void {
    try {
      this.surface().setPointerCapture(pointerId);
    } catch {
      // Capture is an optimisation; dragging works without it.
    }
  }
}
