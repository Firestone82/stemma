import { signal } from '@angular/core';
import { LayoutResult } from '../../core/layout/types';
import { EMPTY_LAYOUT, anchorShift, easeInOut, lerpLayout } from './tween';
import { ChartViewport } from './viewport';

const GLIDE_MS = 380;
/**
 * A gap between two frames of a glide longer than this (in ms) and the glide stops where it is going: on a big
 * tree, or a slow computer, every frame of it redraws so much that it would stutter rather than glide.
 */
const SLOW_FRAME_MS = 45;
/**
 * More people coming or going than this and the chart changes at once: a
 * glide redraws every card on every frame, which on a big tree turns into a
 * stutter (switching the family view, a Relatives step).
 */
const MAX_GLIDE_CHANGES = 40;

/**
 * The layout on screen. When the tree changes, the chart glides from the old
 * layout to the new one, and the view follows so the person being worked on
 * stays still under the pointer.
 */
export class LayoutMotion {
  /** The layout on screen; during a glide, a frame between two layouts. */
  readonly displayed = signal<LayoutResult>(EMPTY_LAYOUT);
  /** The chart is gliding from one layout to another. */
  readonly gliding = signal(false);
  /** Set when the person moves the chart during a glide; the view then stops following. */
  userMoved = false;

  private frame: number | null = null;
  private lastLoadId = -1;

  constructor(
    private readonly viewport: ChartViewport,
    private readonly reduceMotion: boolean,
  ) {}

  /**
   * Shows `target`. Returns true when it belongs to a different tree than the
   * one on screen (a file was opened); the caller then frames it afresh.
   * `anchors` are the people to keep still, in order of preference.
   */
  show(target: LayoutResult, loadId: number, anchors: readonly string[]): boolean {
    const from = this.displayed();
    const reload = loadId !== this.lastLoadId || !from.cards.length;
    this.lastLoadId = loadId;
    this.stop();
    if (reload) {
      this.displayed.set(target);
      return true;
    }
    const shift = anchorShift(from, target, [...anchors]);
    const v0 = this.viewport.view();
    this.userMoved = false;
    if (this.reduceMotion || bigChange(from, target)) {
      this.displayed.set(target);
      this.viewport.view.set({ x: v0.x - shift.x * v0.k, y: v0.y - shift.y * v0.k, k: v0.k });
      return false;
    }
    const start = performance.now();
    let last = -1;
    let frames = 0;
    const step = (now: number) => {
      // The first frame carries the work of the change itself; the ones after show how heavy a frame of the glide is.
      const slow = frames++ > 1 && now - last > SLOW_FRAME_MS;
      last = now;
      const t = slow ? 1 : Math.min(1, (now - start) / GLIDE_MS);
      const e = easeInOut(t);
      this.displayed.set(t < 1 ? lerpLayout(from, target, e) : target);
      if (!this.userMoved) this.viewport.view.set({ x: v0.x - shift.x * v0.k * e, y: v0.y - shift.y * v0.k * e, k: v0.k });
      this.frame = t < 1 ? requestAnimationFrame(step) : null;
      if (t >= 1) this.gliding.set(false);
    };
    this.gliding.set(true);
    this.frame = requestAnimationFrame(step);
    return false;
  }

  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.gliding.set(false);
  }
}

/** Whether so many people come or go between two layouts that gliding would stutter. */
function bigChange(from: LayoutResult, to: LayoutResult): boolean {
  const before = new Set(from.cards.map((c) => c.personId));
  let changes = 0;
  for (const c of to.cards) if (!before.delete(c.personId)) changes++;
  return changes + before.size > MAX_GLIDE_CHANGES;
}
