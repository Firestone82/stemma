import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { Anchor, LegendBox, PrintSettings } from '../../../core/model/types';
import { NamesStyle, PosterResult } from '../../../core/poster/poster';
import { CardGap, GAP_WIDEST, gapAt, gapBetween, gapKey } from '../../../core/layout/gaps';
import { roundedPath } from '../../../core/layout/lines';
import { addBend, removeBend } from '../../../core/layout/moves';
import { I18n } from '../../../i18n/i18n';
import { Icon } from '../../../shared/icon/icon';

/**
 * The page as it will print, on a light table. The SVG is placed in the page
 * itself, so it uses the fonts the app has already loaded. A button opens it
 * in a window of its own. The preview can be zoomed into for a closer look
 * (the wheel, a double click, the buttons) and dragged about while zoomed;
 * that changes nothing on the print. The families' names sit in a box that
 * can be dragged elsewhere on the page and resized by its corners; the names
 * are fitted to it. A box that was moved waits where it was put, its
 * lettering with it and the cards as they were, until the move is applied
 * (the page is then drawn again around it) or discarded.
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
  /** The menu of the families' names' box was asked for (right click): where. */
  readonly boxMenu = output<{ x: number; y: number }>();
  /** A card's menu was asked for (right click, or a long press): the person's id, and where. */
  readonly cardMenu = output<{ personId: string; x: number; y: number }>();
  /** How many cards have been moved by hand. */
  readonly moved = input(0);
  /** All of them back where the layout has them. */
  readonly unmove = output<void>();
  /** How many people have been brought onto the print by hand (from a card's menu). */
  readonly added = input(0);
  /** Nobody brought onto it by hand any more. */
  readonly unadd = output<void>();
  /** The lines from parents to children, whole (see PosterResult.lines). */
  readonly lines = input<readonly ChildLine[]>([]);
  /** A click on a line: every child who hangs on that stretch of it, with the family the line belongs to. */
  readonly lineCut = output<{ familyId: string; childId: string }[]>();
  /** How many lines have been led by hand. */
  readonly bent = input(0);
  /** All of them led by the layout again. */
  readonly unbend = output<void>();
  /** The keys of the lines led by hand: their bends are marked on the page, to be taken off with a right click. */
  readonly bentKeys = input<readonly string[]>([]);
  /** One line led by the layout again (its last bend taken off). */
  readonly lineUnbend = output<string>();
  /** A line led by hand: its key and its points, start to end, in the layout's units. */
  readonly lineBend = output<{ key: string; points: { x: number; y: number }[] }>();
  /** A card dragged to a new place: how far, in the layout's units. */
  readonly cardMove = output<{ personId: string; dx: number; dy: number; alone: boolean }>();
  /** The size of a card in the layout's units, for lining a dragged card up with the others. */
  readonly cardUnits = input<{ w: number; h: number } | null>(null);
  /**
   * The gap the layout keeps between two people's cards side by side (partners, brothers and sisters, families),
   * in the layout's units: a card dragged next to another snaps to it.
   */
  readonly gapFor = input<((a: string, b: string) => number) | null>(null);
  /** Gaps between two cards made wider by hand (PrintSettings.gaps): by gapKey, how much wider, in the layout's units. */
  readonly gaps = input<Readonly<Record<string, number>>>({});
  /** A gap made so much wider than the layout has it (0: as the layout has it). */
  readonly gapChange = output<{ key: string; by: number }>();
  /** Every gap as the layout has it again. */
  readonly ungap = output<void>();
  /** How many millimetres on paper one unit of the layout is: a gap's width is shown in millimetres. */
  readonly unitMm = input(0);
  /** How many gaps have been made wider by hand. */
  readonly gapped = input(0);
  /** People left out of this print by clicking, if any, with how to bring them back. */
  readonly omitted = input(0);
  /** The page is being drawn again: a note over the one shown before (see PrintModel.drawing). */
  readonly drawing = input(false);
  /** What the work is busy with just now, in words (PrintModel.note); the usual words when empty. */
  readonly progress = input('');
  readonly restore = output<void>();
  /** Where the families' names are, as shares of the page (see PosterResult.legend). */
  readonly legend = input<(LegendBox & { free: boolean }) | null>(null);
  /** Where the title is, the same way (see PosterResult.title). */
  readonly title = input<(LegendBox & { free: boolean }) | null>(null);
  /**
   * Boxes placed by hand: the names' box moved or resized, the title moved (its middle across and its top, as
   * shares of the page); null puts one back where the page has it by itself. They wait with the other changes
   * that wait (see `staged`) until applied.
   */
  readonly boxesPlace = output<BoxesPlaced>();
  /**
   * Where the boxes will be once the changes that wait are applied (moved here, held at another place, made
   * bigger or smaller): they are shown there, with their lettering, on the page as it is (see PrintModel.staged).
   */
  readonly staged = input<Partial<Record<Which, LegendBox>>>({});
  /** Some changes wait to be applied: a bar offers Apply and Discard. */
  readonly waiting = input(false);
  /** The gap the title's box and the names' box keep between them, as shares of the page: a box moved near the other snaps to it. */
  readonly boxGap = input<{ x: number; y: number } | null>(null);
  /** Which of the boxes keep a place of their own that no card stands on (the title always; the names when asked). */
  readonly blocking = input<{ legend: boolean; title: boolean }>({ legend: false, title: true });
  readonly apply = output<void>();
  readonly discard = output<void>();
  /** The families' names drawn into a box on this page (see PosterResult.namesIn): for showing them in a box being changed. */
  readonly namesIn = input<PosterResult['namesIn'] | null>(null);
  /** How the names are drawn into a box: where they stand in it, how big (see PosterResult.namesIn). */
  readonly namesStyle = input<NamesStyle>({});
  /** The page inside its margin: what a box being moved is lined up with. */
  readonly inner = input<LegendBox | null>(null);

  protected readonly corners = ['nw', 'ne', 'sw', 'se'] as const;
  /** The box being dragged, where it is now. */
  private readonly boxDraft = signal<{ which: Which; box: LegendBox } | null>(null);
  /** The two boxes that can be moved about the page: the families' names (resized too) and the title. */
  protected readonly boxes = computed(() => {
    const draft = this.boxDraft();
    const staged = this.staged();
    const out: (LegendBox & { which: Which; free: boolean; pending: boolean; blocks: boolean })[] = [];
    for (const which of ['legend', 'title'] as const) {
      const at = which === 'legend' ? this.legend() : this.title();
      const moved = staged[which];
      if (!at) continue;
      const blocks = this.blocking()[which];
      if (draft?.which === which) out.push({ ...draft.box, which, free: true, pending: true, blocks });
      else if (moved) out.push({ ...moved, which, free: at.free, pending: this.waiting(), blocks });
      else out.push({ ...at, which, pending: false, blocks });
    }
    return out;
  });
  /** While a box is moved: lines from its corner to the margin, marked where the two are as long as each other. */
  protected readonly guides = signal<readonly Guide[]>([]);
  protected boxDrag: { id: number; which: Which; what: 'move' | Corner; x: number; y: number; start: LegendBox; moved: boolean } | null = null;

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
  /**
   * When a drag last ended, so the click that ends it does nothing. A time and not a flag: the click never
   * comes when the page was drawn again under the pointer in between, and the flag would then eat the next one.
   */
  private draggedAt = -Infinity;

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    // Added up and applied once a frame: a touchpad sends many events a frame, and the page is drawn again for each.
    const w = (this.wheeled ??= { k: 1, x: event.clientX, y: event.clientY });
    w.k *= Math.exp(-event.deltaY * 0.0015);
    w.x = event.clientX;
    w.y = event.clientY;
    this.wheelFrame ??= requestAnimationFrame(() => {
      const done = this.wheeled;
      this.wheeled = null;
      this.wheelFrame = null;
      if (done) this.zoomAt(done.k, done.x, done.y);
    });
  }

  private wheeled: { k: number; x: number; y: number } | null = null;
  private wheelFrame: number | null = null;

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

  /** A card being dragged: where it and the pointer started, and the other cards it can line up with. */
  private cardDrag: {
    id: number;
    el: SVGGElement;
    personId: string;
    from: DOMPoint;
    at: { x: number; y: number };
    w: number;
    others: { id: string; x: number; y: number; w: number }[];
    guides: SVGGElement | null;
    dx: number;
    dy: number;
    moved: boolean;
  } | null = null;

  /**
   * A stretch of a line being dragged across (a level stretch up or down, an upright one sideways): the line's
   * points with that stretch at `seg`, where the pointer and the stretch started, and what it can line up with.
   */
  private lineDrag: {
    id: number;
    /** The points the line had (its bends among them), as against those put in for the drag: only these may stay in the middle of a straight run. */
    kept: Set<{ x: number; y: number }>;
    key: string;
    family: string;
    child: string;
    points: { x: number; y: number }[];
    seg: number;
    level: boolean;
    from: DOMPoint;
    was: number;
    inverse: DOMMatrix;
    unit: number;
    snaps: number[];
    overlay: SVGPathElement;
    guide: SVGLineElement;
    moved: boolean;
  } | null = null;

  /**
   * The gap picked by a click in the empty room between two cards (see gapAt): its two people and, on the page
   * as it is drawn, where it is (in the layout's units). Kept while the page is drawn again, found there anew.
   */
  protected readonly gap = signal<CardGap | null>(null);
  /** How much wider than the layout has it the picked gap is now (while it is dragged: as far as it is dragged). */
  protected readonly gapBy = computed(() => {
    const g = this.gap();
    const draft = this.gapDraft();
    if (!g) return 0;
    return draft ?? this.gaps()[gapKey(g.a, g.b)] ?? 0;
  });
  /** How wide the picked gap is being dragged to, before it is let go of. */
  private readonly gapDraft = signal<number | null>(null);
  /** The picked gap being dragged wider or narrower: where the pointer started, and how far one unit of the layout is on screen. */
  private gapDrag: { id: number; from: DOMPoint; inverse: DOMMatrix; was: number; moved: boolean } | null = null;
  /** How much wider the picked gap is, in millimetres on paper as the page is drawn now. */
  protected readonly gapMm = computed(() => Math.max(1, Math.round(this.gapBy() * this.unitMm())));
  /** How much wider the picked gap was when the page shown was drawn: the band is drawn out or in from there until the next page comes. */
  private readonly gapDrawnBy = signal(0);
  /** How much one press of + or − widens or narrows a gap, in the layout's units. */
  protected readonly gapStep = 10;

  /** The cards on the page as drawn, in the layout's units, and the group they are drawn in. */
  private pageCards(): { group: SVGGraphicsElement; cards: { personId: string; ghost: boolean; x: number; y: number; w: number; h: number }[] } | null {
    const first = this.sheet()?.nativeElement.querySelector<SVGGElement>('g[data-person]');
    const group = first?.parentNode;
    if (!(group instanceof SVGGraphicsElement)) return null;
    const cards = [...group.querySelectorAll<SVGGElement>(':scope > g[data-person]')].map((g) => {
      const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
      const rect = g.querySelector('rect');
      return {
        personId: g.dataset['person'] ?? '',
        ghost: g.dataset['ghost'] === '1',
        x: Number(m?.[1] ?? 0),
        y: Number(m?.[2] ?? 0),
        w: Number(rect?.getAttribute('width')) || 0,
        h: Number(rect?.getAttribute('height')) || 0,
      };
    });
    return { group, cards };
  }

  /** Picks the gap between the two cards either side of a point on the screen; false when there is none there. */
  private pickGap(clientX: number, clientY: number): boolean {
    const page = this.pageCards();
    const inverse = page?.group.getScreenCTM()?.inverse();
    if (!page || !inverse) return false;
    const p = new DOMPoint(clientX, clientY).matrixTransform(inverse);
    // No wider than a few cards: a click far out in the margin picks nothing.
    const widest = (this.cardUnits()?.w ?? 188) * 3;
    const found = gapAt(page.cards, p, widest + GAP_WIDEST);
    if (!found) return false;
    const by = this.gaps()[gapKey(found.a, found.b)] ?? 0;
    if (found.to - found.from - by > widest) return false;
    this.gap.set(found);
    this.gapDrawnBy.set(by);
    return true;
  }

  /** Lets go of the picked gap. */
  protected closeGap(): void {
    this.gap.set(null);
    this.gapDraft.set(null);
  }

  /** The picked gap made `by` wider than the layout has it (never narrower). */
  protected setGap(by: number): void {
    const g = this.gap();
    if (!g) return;
    this.gapChange.emit({ key: gapKey(g.a, g.b), by: Math.max(0, Math.min(GAP_WIDEST, Math.round(by))) });
  }

  /** The picked gap found again on the page drawn now (its cards may have moved), or let go of when its two cards no longer stand next to each other. */
  private findGap(): void {
    const g = untracked(() => this.gap());
    if (!g) return;
    const page = this.pageCards();
    const a = page?.cards.find((c) => c.personId === g.a && !c.ghost);
    const b = page?.cards.find((c) => c.personId === g.b && !c.ghost);
    const now = a && b ? gapBetween(a, b) : undefined;
    this.gap.set(now && now.a === g.a && now.axis === g.axis ? now : null);
    this.gapDrawnBy.set(this.gaps()[gapKey(g.a, g.b)] ?? 0);
  }

  /** The picked gap marked on the page: a band across it, as wide as it is dragged to. Drawn in the cards' group, so it zooms with them. */
  private drawGap(): void {
    const page = this.sheet()?.nativeElement;
    page?.querySelector('g.gap-pick')?.remove();
    const g = this.gap();
    const group = page?.querySelector('g[data-person]')?.parentNode;
    if (!g || !(group instanceof SVGGraphicsElement)) return;
    const to = g.to + this.gapBy() - this.gapDrawnBy();
    const ns = 'http://www.w3.org/2000/svg';
    const mark = document.createElementNS(ns, 'g');
    mark.setAttribute('class', 'gap-pick');
    const band = document.createElementNS(ns, 'rect');
    band.setAttribute('class', g.axis === 'y' ? 'gap-band down' : 'gap-band');
    const span = Math.max(to - g.from, 2);
    const [x, y, w, h] = g.axis === 'x' ? [g.from, g.lo, span, g.hi - g.lo] : [g.lo, g.from, g.hi - g.lo, span];
    for (const [k, v] of Object.entries({ x, y, width: w, height: h, rx: 3 })) band.setAttribute(k, String(v));
    mark.appendChild(band);
    group.appendChild(mark);
  }

  /** The picked gap's band taken hold of: dragged, the gap goes wider or narrower. */
  private startGapDrag(event: PointerEvent): boolean {
    const g = this.gap();
    const inverse = (this.sheet()?.nativeElement.querySelector('g[data-person]')?.parentNode as SVGGraphicsElement | null)?.getScreenCTM()?.inverse();
    if (!g || !inverse) return false;
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.gapDrag = { id: event.pointerId, from: new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse), inverse, was: this.gapBy(), moved: false };
    return true;
  }

  private dragGap(event: PointerEvent): void {
    const d = this.gapDrag!;
    const g = this.gap();
    if (!g) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(d.inverse);
    const delta = g.axis === 'x' ? p.x - d.from.x : p.y - d.from.y;
    if (!d.moved && Math.abs(delta) < 2) return;
    d.moved = true;
    // In steps of two units; with Alt held, exactly where it is put.
    const by = Math.max(0, Math.min(GAP_WIDEST, d.was + delta));
    this.gapDraft.set(event.altKey ? by : Math.round(by / 2) * 2);
  }

  private dropGap(): void {
    const d = this.gapDrag!;
    this.gapDrag = null;
    const draft = this.gapDraft();
    if (!d.moved || draft === null) {
      this.gapDraft.set(null);
      return;
    }
    this.draggedAt = performance.now();
    this.setGap(draft);
    // Shown as dragged until the page drawn with it comes.
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button === 0 && (event.target as Element | null)?.closest('.gap-band') && this.startGapDrag(event)) return;
    const card = event.button === 0 ? (event.target as Element | null)?.closest<SVGGElement>('g[data-person]') : null;
    const parent = card?.parentNode;
    if (card && parent instanceof SVGGraphicsElement) {
      // A card: dragged, it moves; let go where it was, it is a click (onClick).
      const inverse = parent.getScreenCTM()?.inverse();
      if (!inverse) return;
      const place = (g: Element) => {
        const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
        return { x: Number(m?.[1] ?? 0), y: Number(m?.[2] ?? 0) };
      };
      const width = (g: Element) => Number(g.querySelector('rect')?.getAttribute('width')) || (this.cardUnits()?.w ?? 188);
      event.preventDefault();
      this.cardDrag = {
        id: event.pointerId,
        el: card,
        personId: card.dataset['person'] ?? '',
        from: new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse),
        at: place(card),
        w: width(card),
        others: [...parent.querySelectorAll<SVGGElement>(':scope > g[data-person]')]
          .filter((g) => g !== card)
          .map((g) => ({ id: g.dataset['person'] ?? '', ...place(g), w: width(g) })),
        guides: null,
        dx: 0,
        dy: 0,
        moved: false,
      };
      return;
    }
    // A line: dragged, the stretch under the pointer goes across; let go where it was, it is a click (onClick).
    if (event.button === 0 && !(event.target as Element | null)?.closest('.page-box') && this.startLineDrag(event)) return;
    if (this.zoom().k <= 1 || event.button !== 0) return;
    event.preventDefault();
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }

  /** Starts dragging the stretch of a line under the pointer; false when there is none. */
  private startLineDrag(event: PointerEvent): boolean {
    const page = this.sheet()?.nativeElement;
    const path = page?.querySelector<SVGPathElement>('path[data-child]');
    const ctm = path?.getScreenCTM();
    const parent = path?.parentNode;
    if (!page || !path || !ctm || !(parent instanceof SVGGElement)) return false;
    const inverse = ctm.inverse();
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    const unit = 1 / Math.hypot(ctm.a, ctm.b);
    const reach = 7 * unit;
    let hit: { line: ChildLine; seg: number; d: number } | null = null;
    for (const line of this.lines()) {
      for (let i = 1; i < line.points.length; i++) {
        const d = distanceTo([line.points[i - 1], line.points[i]], p);
        if (d < reach && (!hit || d < hit.d)) hit = { line, seg: i - 1, d };
      }
    }
    if (!hit) return false;
    const points = hit.line.points.map((q) => ({ x: q.x, y: q.y }));
    let seg = hit.seg;
    const a = points[seg];
    const b = points[seg + 1];
    const level = Math.abs(a.y - b.y) < 0.01;
    // The stretch out of the marker or into the card: a short piece of it stays, so the line still leaves and
    // enters as it should, and the rest goes across with a step.
    const stub = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const len = Math.hypot(to.x - from.x, to.y - from.y);
      const t = Math.min(0.5, 12 / Math.max(len, 1));
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    };
    if (seg === 0) {
      const q = stub(points[0], points[1]);
      points.splice(1, 0, { ...q }, { ...q });
      seg = 2;
    }
    if (seg + 1 === points.length - 1) {
      const n = points.length;
      const q = stub(points[n - 1], points[n - 2]);
      points.splice(n - 1, 0, { ...q }, { ...q });
    }
    // A bend put on the line by hand at either end of the stretch: the stretch beyond it stays, and a step joins the two.
    const runsOn = (u: { x: number; y: number }, v: { x: number; y: number }) =>
      (Math.abs(u.x - v.x) > 0.01 || Math.abs(u.y - v.y) > 0.01) && (level ? Math.abs(u.y - v.y) < 0.01 : Math.abs(u.x - v.x) < 0.01);
    if (seg > 0 && runsOn(points[seg - 1], points[seg])) {
      points.splice(seg, 0, { ...points[seg] });
      seg++;
    }
    if (seg + 2 < points.length && runsOn(points[seg + 1], points[seg + 2])) points.splice(seg + 2, 0, { ...points[seg + 1] });
    // What the stretch can line up with: the same stretches of other lines, the edges and middles of the cards
    // (kept clear of by the layout's margin), the line's own two ends.
    const snaps: number[] = [];
    for (const line of this.lines()) {
      if (line === hit.line) continue;
      for (let i = 1; i < line.points.length; i++) {
        const u = line.points[i - 1];
        const v = line.points[i];
        if (level && Math.abs(u.y - v.y) < 0.01) snaps.push(u.y);
        if (!level && Math.abs(u.x - v.x) < 0.01) snaps.push(u.x);
      }
    }
    const margin = 6;
    for (const g of parent.querySelectorAll<SVGGElement>(':scope > g[data-person]')) {
      const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '');
      const rect = g.querySelector('rect');
      if (!m || !rect) continue;
      const x = Number(m[1]);
      const y = Number(m[2]);
      const w = Number(rect.getAttribute('width')) || 0;
      const h = Number(rect.getAttribute('height')) || 0;
      if (level) snaps.push(y - margin, y + h + margin, y + h / 2);
      else snaps.push(x - margin, x + w + margin, x + w / 2);
    }
    const ends = [hit.line.points[0], hit.line.points[hit.line.points.length - 1]];
    for (const e of ends) snaps.push(level ? e.y : e.x);
    event.preventDefault();
    const ns = 'http://www.w3.org/2000/svg';
    const overlay = document.createElementNS(ns, 'path');
    overlay.setAttribute('fill', 'none');
    overlay.setAttribute('stroke', '#d2452f');
    overlay.setAttribute('stroke-width', String(2 * unit));
    overlay.setAttribute('stroke-linecap', 'round');
    overlay.setAttribute('pointer-events', 'none');
    const guide = document.createElementNS(ns, 'line');
    guide.setAttribute('class', 'line-guide');
    guide.setAttribute('stroke', '#d2452f');
    guide.setAttribute('stroke-width', String(1 * unit));
    guide.setAttribute('stroke-dasharray', `${5 * unit} ${4 * unit}`);
    guide.setAttribute('pointer-events', 'none');
    guide.style.display = 'none';
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    this.lineDrag = {
      id: event.pointerId,
      kept: new Set(points.filter((q) => hit!.line.points.some((o) => o.x === q.x && o.y === q.y))),
      key: hit.line.key ?? `${hit.line.familyId}|${hit.line.childId}`,
      family: hit.line.familyId,
      child: hit.line.childId,
      points,
      seg,
      level,
      from: p,
      was: level ? points[seg].y : points[seg].x,
      inverse,
      unit,
      snaps,
      overlay,
      guide,
      moved: false,
    };
    return true;
  }

  /**
   * The stretch follows the pointer across: pulled onto a stretch of another line, a card's edge (kept clear
   * of by the margin) or middle, or the line's own end when it comes near; otherwise in steps of four units.
   * With Alt held it goes exactly where it is put.
   */
  private dragLine(event: PointerEvent): void {
    const d = this.lineDrag!;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(d.inverse);
    const delta = d.level ? p.y - d.from.y : p.x - d.from.x;
    if (!d.moved && Math.abs(delta) < 3 * d.unit) return;
    if (!d.moved) {
      d.moved = true;
      const page = this.sheet()?.nativeElement;
      const parent = page?.querySelector('path[data-child]')?.parentNode;
      parent?.appendChild(d.overlay);
      parent?.appendChild(d.guide);
      for (const path of page?.querySelectorAll<SVGPathElement>(`path[data-family="${d.family}"][data-child="${d.child}"]`) ?? []) path.style.opacity = '0.2';
    }
    let v = d.was + delta;
    let snapped: number | undefined;
    if (!event.altKey) {
      const near = d.snaps.reduce<number | undefined>(
        (best, s) => (Math.abs(s - v) < 6 * d.unit && (best === undefined || Math.abs(s - v) < Math.abs(best - v)) ? s : best),
        undefined,
      );
      if (near !== undefined) v = snapped = near;
      else v = Math.round(v / 4) * 4;
    }
    const a = d.points[d.seg];
    const b = d.points[d.seg + 1];
    if (d.level) a.y = b.y = v;
    else a.x = b.x = v;
    d.overlay.setAttribute('d', roundedPath(d.points, 6));
    if (snapped === undefined) d.guide.style.display = 'none';
    else {
      d.guide.style.display = '';
      const span = 400;
      const mid = d.level ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
      const [x1, y1, x2, y2] = d.level ? [mid - span, v, mid + span, v] : [v, mid - span, v, mid + span];
      d.guide.setAttribute('x1', String(x1));
      d.guide.setAttribute('y1', String(y1));
      d.guide.setAttribute('x2', String(x2));
      d.guide.setAttribute('y2', String(y2));
    }
  }

  /** The line let go of: kept as it was led, or (not moved) left to the click that follows. */
  private dropLine(): void {
    const d = this.lineDrag!;
    this.lineDrag = null;
    d.overlay.remove();
    d.guide.remove();
    if (!d.moved) return;
    this.draggedAt = performance.now();
    this.lineBend.emit({ key: d.key, points: tidied(d.points, d.kept) });
  }

  /**
   * The card follows the pointer, pulled into line with a card it is nearly level with or nearly under, and next
   * to a card in its row, to the gap the layout keeps between those two (partners, brothers and sisters,
   * families); with Alt held it goes exactly where it is put.
   */
  private dragCard(event: PointerEvent): void {
    const c = this.cardDrag;
    const parent = c?.el.parentNode;
    if (!c || !(parent instanceof SVGGraphicsElement)) return;
    const inverse = parent.getScreenCTM()?.inverse();
    if (!inverse) return;
    const now = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    let dx = now.x - c.from.x;
    let dy = now.y - c.from.y;
    const size = this.cardUnits() ?? { w: 188, h: 66 };
    if (!c.moved && Math.hypot(dx, dy) < size.h * 0.08) return;
    if (!c.moved) {
      c.moved = true;
      c.el.setPointerCapture?.(event.pointerId);
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
      parent.appendChild(c.el);
    }
    c.guides?.remove();
    c.guides = null;
    if (!event.altKey) {
      const x = c.at.x + dx;
      const y = c.at.y + dy;
      const reach = size.h * 0.14;
      type Other = (typeof c.others)[number];
      const nearest = (of: (o: Other) => number, to: number, far: (o: Other) => number, here: number) =>
        c.others
          .filter((o) => Math.abs(of(o) - to) < reach)
          .sort((a, b) => Math.abs(of(a) - to) - Math.abs(of(b) - to) || Math.abs(far(a) - here) - Math.abs(far(b) - here))[0];
      let column: Other | undefined = nearest(
        (o) => o.x,
        x,
        (o) => o.y,
        y,
      );
      const row = nearest(
        (o) => o.y,
        y,
        (o) => o.x,
        x,
      );
      if (row) dy = row.y - c.at.y;
      // Next to a card in its row: the gap the layout keeps between the two, whichever side it is on.
      const gapFor = this.gapFor();
      const ny = c.at.y + dy;
      let gap: { x: number; from: number; to: number } | undefined;
      if (gapFor) {
        let best = size.h * 0.3;
        for (const o of c.others) {
          if (Math.abs(o.y - ny) > 0.5) continue;
          const want = gapFor(c.personId, o.id);
          for (const to of [o.x + o.w + want, o.x - want - c.w]) {
            const off = Math.abs(to - x);
            if (off < best) {
              best = off;
              gap = { x: to, from: to > o.x ? o.x + o.w : to + c.w, to: to > o.x ? to : o.x };
            }
          }
        }
      }
      // The nearer of the two pulls: a card under another, or the gap beside one.
      if (gap && (!column || Math.abs(gap.x - x) <= Math.abs(column.x - x))) column = undefined;
      else gap = undefined;
      if (column) dx = column.x - c.at.x;
      if (gap) dx = gap.x - c.at.x;
      if (column || row || gap) {
        const ns = 'http://www.w3.org/2000/svg';
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'move-guides');
        const line = (x1: number, y1: number, x2: number, y2: number) => {
          const l = document.createElementNS(ns, 'line');
          for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) l.setAttribute(k, String(v));
          g.appendChild(l);
        };
        const nx = c.at.x + dx;
        // Down the middle of the two cards in a column, across the middle of the two in a row.
        if (column) line(nx + c.w / 2, Math.min(ny, column.y) - size.h * 0.3, nx + c.w / 2, Math.max(ny, column.y) + size.h * 1.3);
        if (row && !gap) line(Math.min(nx, row.x) - size.h * 0.3, ny + size.h / 2, Math.max(nx + c.w, row.x + row.w) + size.h * 0.3, ny + size.h / 2);
        // The gap, measured: a line across it with a tick at either end.
        if (gap) {
          const t = size.h * 0.12;
          line(gap.from, ny + size.h / 2, gap.to, ny + size.h / 2);
          line(gap.from, ny + size.h / 2 - t, gap.from, ny + size.h / 2 + t);
          line(gap.to, ny + size.h / 2 - t, gap.to, ny + size.h / 2 + t);
        }
        parent.appendChild(g);
        c.guides = g;
      }
    }
    c.dx = dx;
    c.dy = dy;
    c.el.setAttribute('transform', `translate(${c.at.x + dx},${c.at.y + dy})`);
  }

  /**
   * The lines that run under the pointer, or just beside it (they are thin): one line where it leads to one
   * child, all of a family's where it is the stretch they share.
   */
  private linesAt(clientX: number, clientY: number): ChildLine[] {
    const ctm = this.sheet()?.nativeElement.querySelector<SVGPathElement>('path[data-child]')?.getScreenCTM();
    if (!ctm) return [];
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    // Seven pixels of the screen, in the layout's units.
    const reach = 7 / Math.hypot(ctm.a, ctm.b);
    const far = this.lines().map((l) => ({ l, d: distanceTo(l.points, p) }));
    const nearest = Math.min(reach, ...far.map((f) => f.d));
    return nearest < reach ? far.filter((f) => f.d <= nearest + 0.75).map((f) => f.l) : [];
  }

  /** The lines that would be cut by a click where the pointer is, marked on the page. */
  private marked = '';
  private markLines(event: PointerEvent): void {
    const page = this.sheet()?.nativeElement;
    if (!page) return;
    const on = !!(event.target as Element | null)?.closest('[data-person], .page-box, .gap-band');
    const hits = on ? [] : this.linesAt(event.clientX, event.clientY);
    const key = hits.map((h) => `${h.familyId} ${h.childId}`).join('|');
    if (key === this.marked) return;
    this.marked = key;
    const cut = new Set(hits.map((h) => `${h.familyId} ${h.childId}`));
    for (const path of page.querySelectorAll<SVGPathElement>('path[data-child]'))
      path.classList.toggle('cut', cut.has(`${path.dataset['family']} ${path.dataset['child']}`));
    page.classList.toggle('on-line', hits.length > 0);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.gapDrag?.id === event.pointerId) {
      this.dragGap(event);
      return;
    }
    if (this.cardDrag?.id === event.pointerId) {
      this.dragCard(event);
      return;
    }
    if (this.lineDrag?.id === event.pointerId) {
      this.dragLine(event);
      return;
    }
    const d = this.drag;
    if (!d && !event.buttons) this.markLines(event);
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
    if (this.gapDrag?.id === event.pointerId) {
      this.dropGap();
      return;
    }
    const c = this.cardDrag;
    if (c?.id === event.pointerId) {
      this.cardDrag = null;
      c.guides?.remove();
      if (c.moved) this.draggedAt = performance.now();
      // With Ctrl (or Cmd) held, the card goes alone: what hangs under it stays.
      if (c.moved && c.personId) this.cardMove.emit({ personId: c.personId, dx: c.dx, dy: c.dy, alone: event.ctrlKey || event.metaKey });
      return;
    }
    if (this.lineDrag?.id === event.pointerId) {
      this.dropLine();
      return;
    }
    if (this.drag?.id !== event.pointerId) return;
    if (this.drag.moved) this.draggedAt = performance.now();
    this.drag = null;
    this.panning.set(false);
  }

  /** Where a box is: where it was last put, applied or not. */
  private boxAt(which: Which): LegendBox | null {
    const at = this.staged()[which] ?? (which === 'legend' ? this.legend() : this.title());
    return at ? { x: at.x, y: at.y, w: at.w, h: at.h } : null;
  }

  protected onBoxDown(event: PointerEvent, which: Which, what: 'move' | Corner): void {
    const at = this.boxAt(which);
    if (event.button !== 0 || !at || this.boxDrag) return;
    event.stopPropagation();
    event.preventDefault();
    const box = event.currentTarget instanceof HTMLElement ? event.currentTarget.closest('.page-box') : null;
    box?.setPointerCapture(event.pointerId);
    this.boxDrag = { id: event.pointerId, which, what, x: event.clientX, y: event.clientY, start: at, moved: false };
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
    let box = movedBox(d.start, d.what, dx, dy);
    const inner = this.inner();
    if (d.what === 'move' && inner) {
      // Lined up with the margin and the middle of the page; with Alt held, wherever the pointer puts it.
      const lined = alignBox(box, inner, this.ratio(), !event.altKey);
      box = lined.box;
      this.guides.set(lined.guides);
      // Near the other box, a gap away from it: snapped there (Alt held: not).
      const other = this.boxes().find((b) => b.which !== d.which);
      const gap = this.boxGap();
      if (other && gap && !event.altKey) box = snapToGap(box, other, gap);
    }
    this.boxDraft.set({ which: d.which, box });
  }

  protected onBoxUp(event: PointerEvent): void {
    const d = this.boxDrag;
    if (!d || d.id !== event.pointerId) return;
    event.stopPropagation();
    this.boxDrag = null;
    this.guides.set([]);
    const draft = this.boxDraft();
    if (d.moved && draft) this.putBox(d.which, draft.box, d.what !== 'move');
    else this.boxDraft.set(null);
  }

  /** What each group of lettering was drawn as on this page, before it was drawn again into a box being changed. */
  private readonly drawnAs = new WeakMap<Element, string>();

  /**
   * The title and the families' names follow their boxes while those are moved, and until the changes are
   * applied or discarded: the lettering is shown where it will go, on the page as it is, and the cards stay
   * where they are. The title is moved, and made bigger or smaller with its box; the names are drawn again into
   * their box as it is now, so a box being made bigger or smaller shows at once how they will stand in it.
   */
  private showMoved(): void {
    const page = this.sheet()?.nativeElement;
    const w = this.width();
    const h = this.height();
    if (!page || !w || !h) return;
    const round = (v: number) => Math.round(v * 100) / 100 || 0;
    for (const which of ['legend', 'title'] as const) {
      const group = page.querySelector<SVGGElement>(which === 'legend' ? 'g.pp-legend' : 'g.pp-title');
      const at = which === 'legend' ? this.legend() : this.title();
      const now = this.boxes().find((b) => b.which === which);
      if (!group || !at || !now) continue;
      const changed = now.pending || !!this.staged()[which];
      const namesIn = this.namesIn();
      if (which === 'legend' && namesIn) {
        if (changed) {
          if (!this.drawnAs.has(group)) this.drawnAs.set(group, group.innerHTML);
          group.innerHTML = namesIn(now, this.namesStyle());
        } else if (this.drawnAs.has(group)) {
          group.innerHTML = this.drawnAs.get(group)!;
          this.drawnAs.delete(group);
        }
        group.removeAttribute('transform');
        continue;
      }
      // Moved with its box, middle to middle, and as much bigger or smaller as its box is.
      const k = changed && at.h > 0 ? now.h / at.h : 1;
      const from = { x: (at.x + at.w / 2) * w, y: (at.y + at.h / 2) * h };
      const to = { x: (now.x + now.w / 2) * w, y: (now.y + now.h / 2) * h };
      const still = Math.abs(k - 1) < 0.001;
      if (still && !round(to.x - from.x) && !round(to.y - from.y)) group.removeAttribute('transform');
      else if (still) group.setAttribute('transform', `translate(${round(to.x - from.x)} ${round(to.y - from.y)})`);
      else
        group.setAttribute(
          'transform',
          `translate(${round(to.x)} ${round(to.y)}) scale(${Math.round(k * 1000) / 1000}) translate(${round(-from.x)} ${round(-from.y)})`,
        );
    }
  }

  /** A box put somewhere, or (`sized`) made bigger or smaller: it waits like that, with the other changes, until applied. */
  private putBox(which: Which, box: LegendBox, sized = false): void {
    this.boxDraft.set(null);
    // Let go of at one of the places the settings offer (it snapped there): held there, so the settings show it.
    const inner = this.inner();
    const anchor = !sized && inner ? anchorOf(box, inner) : undefined;
    if (which === 'legend') this.boxesPlace.emit({ legendBox: box, legendSizedOnly: sized, ...(anchor ? { legendAnchor: anchor } : {}) });
    else this.boxesPlace.emit({ titleAt: { x: box.x + box.w / 2, y: box.y }, ...(anchor?.startsWith('top') ? { titleAnchor: anchor } : {}) });
  }

  /**
   * The families' names' box made as small as what is drawn in it (the heading and the names), where it is now: waiting to be applied like any change of the box. False when there is
   * nothing to measure.
   */
  fitNamesBox(): boolean {
    const page = this.sheet()?.nativeElement;
    const group = page?.querySelector<SVGGElement>('g.pp-legend');
    const w = this.width();
    const h = this.height();
    if (!group || !w || !h) return false;
    let b: DOMRect;
    try {
      b = group.getBBox();
    } catch {
      return false;
    }
    if (!b.width || !b.height) return false;
    // A hair of room round them, never more than the box has now: it only ever gets smaller.
    const pad = Math.min(w, h) * 0.002;
    const now = this.boxAt('legend');
    let x0 = Math.max(0, b.x - pad) / w;
    let y0 = Math.max(0, b.y - pad) / h;
    let x1 = Math.min(w, b.x + b.width + pad) / w;
    let y1 = Math.min(h, b.y + b.height + pad) / h;
    if (now) {
      x0 = Math.max(x0, now.x);
      y0 = Math.max(y0, now.y);
      x1 = Math.min(x1, now.x + now.w);
      y1 = Math.min(y1, now.y + now.h);
    }
    if (x1 <= x0 || y1 <= y0) return false;
    this.putBox('legend', { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, true);
    return true;
  }

  /** A box put by hand goes back where the page has it by itself (once applied). */
  protected resetBox(which: Which): void {
    this.boxesPlace.emit(which === 'legend' ? { legendBox: null } : { titleAt: null });
  }

  /** Arrow keys move the box a little; with Shift they make the names' box bigger or smaller. Enter applies what waits. */
  protected onBoxKey(event: KeyboardEvent, which: Which): void {
    if (event.key === 'Enter' && this.waiting()) {
      event.preventDefault();
      event.stopPropagation();
      this.apply.emit();
      return;
    }
    const at = this.boxAt(which);
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!at || !step) return;
    event.preventDefault();
    event.stopPropagation();
    const d = 0.01;
    const sizing = event.shiftKey && which === 'legend';
    this.putBox(which, movedBox(at, sizing ? 'se' : 'move', step[0] * d, step[1] * d), sizing);
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
    if (performance.now() - this.draggedAt < 350) return;
    const card = (event.target as Element | null)?.closest<SVGGElement>('[data-person]');
    const id = card?.dataset['person'];
    if (!(event instanceof MouseEvent)) return;
    // A card's menu: leaving the person out, putting a moved card back.
    if (id) {
      this.cardMenu.emit({ personId: id, x: event.clientX, y: event.clientY });
      return;
    }
    // A line: what hangs on it goes.
    if ((event.target as Element | null)?.closest('.page-box, .gap-band')) return;
    const hits = this.linesAt(event.clientX, event.clientY);
    if (hits.length) {
      this.lineCut.emit(hits.map((h) => ({ familyId: h.familyId, childId: h.childId })));
      return;
    }
    // Anywhere else: the gap picked (with a right click) is let go of.
    this.closeGap();
  }

  /** The menu of the card the pointer is on. */
  protected onContextMenu(event: MouseEvent): void {
    // The families' names' box: its own menu.
    if ((event.target as Element | null)?.closest('.legend-box:not(.title-box)')) {
      event.preventDefault();
      this.boxMenu.emit({ x: event.clientX, y: event.clientY });
      return;
    }
    const card = (event.target as Element | null)?.closest<SVGGElement>('[data-person]');
    const id = card?.dataset['person'];
    if (id) {
      event.preventDefault();
      this.cardMenu.emit({ personId: id, x: event.clientX, y: event.clientY });
      return;
    }
    if ((event.target as Element | null)?.closest('.page-box, .gap-bar')) return;
    // A bend put on a line by hand: taken off. A line: a bend put on it there. The room between two cards: that gap picked.
    if (this.bendAt(event.clientX, event.clientY) || this.pickGap(event.clientX, event.clientY)) event.preventDefault();
  }

  /**
   * A right click on a line: the bend of a line led by hand under the pointer taken off, or else a bend put on the
   * line under the pointer, for it to be led on either side of it. False when there is no line there.
   */
  private bendAt(clientX: number, clientY: number): boolean {
    const ctm = this.sheet()?.nativeElement.querySelector<SVGPathElement>('path[data-child]')?.getScreenCTM();
    if (!ctm) return false;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    const reach = 7 / Math.hypot(ctm.a, ctm.b);
    const bent = new Set(this.bentKeys());
    const keyOf = (l: ChildLine) => l.key ?? `${l.familyId}|${l.childId}`;
    // A bend of a line led by hand, the nearest within reach.
    let near: { line: ChildLine; i: number; d: number } | null = null;
    for (const line of this.lines()) {
      if (!bent.has(keyOf(line))) continue;
      for (let i = 1; i < line.points.length - 1; i++) {
        const d = Math.hypot(line.points[i].x - p.x, line.points[i].y - p.y);
        if (d < reach * 1.2 && (!near || d < near.d)) near = { line, i, d };
      }
    }
    if (near) {
      const left = removeBend(near.line.points, near.i);
      if (left && left.length > 2) this.lineBend.emit({ key: keyOf(near.line), points: left });
      else this.lineUnbend.emit(keyOf(near.line));
      return true;
    }
    const hits = this.linesAt(clientX, clientY);
    if (!hits.length) return false;
    // Of the lines that share the stretch, the one led by hand already, or the first.
    const line = hits.find((l) => bent.has(keyOf(l))) ?? hits[0];
    const put = addBend(line.points, p);
    if (put) this.lineBend.emit({ key: keyOf(line), points: put.points });
    return true;
  }

  /** The bends of the lines led by hand marked on the page (only in the preview): dots a right click takes off. */
  private drawBends(): void {
    const page = this.sheet()?.nativeElement;
    page?.querySelector('g.bend-dots')?.remove();
    const path = page?.querySelector<SVGPathElement>('path[data-child]');
    const parent = path?.parentNode;
    const bent = new Set(this.bentKeys());
    if (!page || !(parent instanceof SVGGElement) || !bent.size) return;
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'bend-dots');
    for (const line of this.lines()) {
      if (!bent.has(line.key ?? `${line.familyId}|${line.childId}`)) continue;
      for (const q of line.points.slice(1, -1)) {
        const c = document.createElementNS(ns, 'circle');
        for (const [k, v] of Object.entries({ cx: q.x, cy: q.y, r: 3.2 })) c.setAttribute(k, String(v));
        g.appendChild(c);
      }
    }
    parent.appendChild(g);
  }

  private readonly sheet = viewChild<ElementRef<HTMLDivElement>>('sheet');
  /** Width divided by height of the page, for sizing the sheet. */
  protected readonly ratio = computed(() => (this.width() && this.height() ? this.width() / this.height() : 1.414));

  constructor() {
    effect(() => {
      const svg = this.svg();
      const host = this.sheet()?.nativeElement;
      if (host) {
        host.innerHTML = svg ?? '';
        // A new page has no line marked on it yet.
        host.classList.remove('on-line');
        this.marked = '';
      }
      // The gap picked is found on the new page, drawn as wide as it now is.
      untracked(() => {
        this.findGap();
        this.gapDraft.set(null);
      });
      // A new page: what still waits is shown on it.
      untracked(() => this.showMoved());
    });
    effect(() => this.showMoved());
    effect(() => {
      this.svg();
      this.drawGap();
    });
    effect(() => {
      this.svg();
      this.lines();
      this.drawBends();
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
type Which = 'legend' | 'title';

/** Boxes placed by hand (see PrintPreview.boxesPlace); null for one put back. */
export interface BoxesPlaced {
  legendBox?: LegendBox | null;
  /** The names' box was made bigger or smaller where it is, and not dragged anywhere. */
  legendSizedOnly?: boolean;
  titleAt?: { x: number; y: number } | null;
  /** The title was let go of at one of its places along the top (snapped there): held there, as if picked. */
  titleAnchor?: Anchor;
  /** The names' box was let go of at one of the page's places (snapped there): its size held there, as if picked. */
  legendAnchor?: Anchor;
}

/**
 * What boxes placed by hand change in the print settings. What was dragged somewhere is no longer held at its
 * anchor; the names' box only made bigger or smaller stays held, at its new size. Put back, either is where
 * the page has it by itself.
 */
export function placedSettings(placed: BoxesPlaced): Partial<PrintSettings> {
  return {
    ...('legendBox' in placed ? { legendBox: placed.legendBox ?? undefined } : {}),
    ...('legendBox' in placed && !(placed.legendBox && placed.legendSizedOnly) ? { legendAnchor: placed.legendAnchor } : {}),
    ...(placed.titleAnchor ? { titleAt: undefined, titleAnchor: placed.titleAnchor === 'top' ? undefined : placed.titleAnchor } : {}),
    ...('titleAt' in placed && !placed.titleAnchor ? { titleAt: placed.titleAt ?? undefined, titleAnchor: undefined } : {}),
  };
}

/** How near a box has to stand to one of the page's places to be taken as held there: about what snapping leaves. */
const AT_ANCHOR = 0.002;

/**
 * The place of the page (a corner, the middle of a side, the middle) a box stands at inside the margin
 * (`inner`), lined up across and down as alignBox snaps it: none when it stands anywhere else.
 */
export function anchorOf(box: LegendBox, inner: LegendBox): Anchor | undefined {
  const near = (a: number, b: number) => Math.abs(a - b) < AT_ANCHOR;
  const across = near(box.x, inner.x)
    ? 'left'
    : near(box.x + box.w / 2, inner.x + inner.w / 2)
      ? 'middle'
      : near(box.x + box.w, inner.x + inner.w)
        ? 'right'
        : undefined;
  const down = near(box.y, inner.y)
    ? 'top'
    : near(box.y + box.h / 2, inner.y + inner.h / 2)
      ? 'middle'
      : near(box.y + box.h, inner.y + inner.h)
        ? 'bottom'
        : undefined;
  if (!across || !down) return undefined;
  if (down === 'middle') return across === 'middle' ? 'center' : across;
  return across === 'middle' ? down : (`${down}-${across}` as Anchor);
}

/** A line shown while a box is moved, in shares of the page; `equal` where it marks two margins of one length. */
export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  equal: boolean;
}

/** How near (as a share of the page's height) a box has to be for it to be pulled into line. */
const SNAP = 0.012;

/**
 * A box being moved, lined up with the page inside its margin (`inner`): pulled onto the margin, into the
 * middle of the page, or to where it is as far from the side as from the top or the foot, when it is nearly
 * there. With it, the lines to show: from the box's corner nearest a corner of the page to the two margins
 * there (marked when they are the same length), and through the middle of the page when the box is in it.
 * `ratio` is the page's width over its height; without `snap` the box stays where it is and only the lines
 * are worked out.
 */
export function alignBox(box: LegendBox, inner: LegendBox, ratio: number, snap = true): { box: LegendBox; guides: Guide[] } {
  let { x, y } = box;
  // Margins in one unit, the page's height: a share across is `ratio` times a share down.
  const gaps = () => ({
    left: (x - inner.x) * ratio,
    right: (inner.x + inner.w - x - box.w) * ratio,
    top: y - inner.y,
    foot: inner.y + inner.h - y - box.h,
  });
  if (snap) {
    let g = gaps();
    if (Math.abs(g.left - g.right) < SNAP * 2) x = inner.x + (inner.w - box.w) / 2;
    else if (Math.abs(g.left) < SNAP) x = inner.x;
    else if (Math.abs(g.right) < SNAP) x = inner.x + inner.w - box.w;
    if (Math.abs(g.top - g.foot) < SNAP * 2) y = inner.y + (inner.h - box.h) / 2;
    else if (Math.abs(g.top) < SNAP) y = inner.y;
    else if (Math.abs(g.foot) < SNAP) y = inner.y + inner.h - box.h;
    // As far from the nearer side as from the top or the foot, whichever is nearer.
    g = gaps();
    const side = Math.min(g.left, g.right);
    const end = Math.min(g.top, g.foot);
    if (side > SNAP / 2 && end > SNAP / 2 && Math.abs(side - end) < SNAP)
      x = g.left <= g.right ? inner.x + end / ratio : inner.x + inner.w - box.w - end / ratio;
  }
  const g = gaps();
  const same = (a: number, b: number) => Math.abs(a - b) < 0.0012;
  const left = g.left <= g.right;
  const top = g.top <= g.foot;
  const cx = left ? x : x + box.w;
  const cy = top ? y : y + box.h;
  const equal = same(left ? g.left : g.right, top ? g.top : g.foot);
  const guides: Guide[] = [
    { x1: cx, y1: cy, x2: left ? inner.x : inner.x + inner.w, y2: cy, equal },
    { x1: cx, y1: cy, x2: cx, y2: top ? inner.y : inner.y + inner.h, equal },
  ];
  if (same(g.left, g.right)) guides.push({ x1: x + box.w / 2, y1: inner.y, x2: x + box.w / 2, y2: inner.y + inner.h, equal: true });
  if (same(g.top, g.foot)) guides.push({ x1: inner.x, y1: y + box.h / 2, x2: inner.x + inner.w, y2: y + box.h / 2, equal: true });
  return { box: { ...box, x, y }, guides };
}

/** The smallest the names' box can be made, as a share of the page. */
const MIN_BOX = 0.04;

/** A line from parents to a child, as the layout has it. */
export interface ChildLine {
  /** The line's key (`family|child`), for keeping it as it was led by hand. */
  key?: string;
  familyId: string;
  childId: string;
  points: readonly { x: number; y: number }[];
}

/** How far a point is from a line of straight stretches. */
export function distanceTo(points: readonly { x: number; y: number }[], p: { x: number; y: number }): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
  }
  return best;
}

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

/** How near a box has to come to the gap from the other one to snap to it, as a share of the page's width and height. */
const GAP_SNAP = 0.012;

/**
 * A box moved above or under another (their sides across each other), or beside it (their tops and feet
 * across each other), is put exactly the gap away from it when it is within a hair of that.
 */
function snapToGap(box: LegendBox, other: LegendBox, gap: { x: number; y: number }): LegendBox {
  let { x, y } = box;
  const across = box.x < other.x + other.w && other.x < box.x + box.w;
  const level = box.y < other.y + other.h && other.y < box.y + box.h;
  if (across) {
    const under = other.y + other.h + gap.y;
    const over = other.y - gap.y - box.h;
    if (Math.abs(box.y - under) < GAP_SNAP) y = under;
    else if (Math.abs(box.y - over) < GAP_SNAP) y = over;
  }
  if (level) {
    const right = other.x + other.w + gap.x;
    const left = other.x - gap.x - box.w;
    if (Math.abs(box.x - right) < GAP_SNAP) x = right;
    else if (Math.abs(box.x - left) < GAP_SNAP) x = left;
  }
  return { ...box, x, y };
}

/**
 * A line as it was dragged, without what the drag put in that is left over: points twice over, and points in the
 * middle of a straight run that the line did not have before (a bend put there by hand, in `kept`, stays).
 */
export function tidied<T extends { x: number; y: number }>(points: readonly T[], kept: ReadonlySet<T>): T[] {
  const out: T[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    out.push(p);
  }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1 || kept.has(p)) return true;
    const a = out[i - 1];
    const b = out[i + 1];
    return !(Math.abs(a.x - p.x) < 0.01 && Math.abs(p.x - b.x) < 0.01) && !(Math.abs(a.y - p.y) < 0.01 && Math.abs(p.y - b.y) < 0.01);
  });
}
