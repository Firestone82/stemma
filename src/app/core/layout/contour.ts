/**
 * The outline of a group of boxes, for sliding groups up against each other: for every thin horizontal band
 * of the chart, how far left and how far right the group reaches there. Two groups keep apart band by
 * band, so one may reach under an overhang of the other.
 */

/** A box and the clear space it keeps around itself. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pad: number;
}

/** Height of a band, in chart units. */
const BAND = 6;

export class Contour {
  /** Band number of the first entry. */
  private first = 0;
  private lo: number[] = [];
  private hi: number[] = [];

  static of(boxes: readonly Box[], dx = 0, dy = 0): Contour {
    const c = new Contour();
    c.add(boxes, dx, dy);
    return c;
  }

  get empty(): boolean {
    return this.lo.length === 0;
  }

  add(boxes: readonly Box[], dx = 0, dy = 0): void {
    for (const b of boxes) this.span(b.x0 + dx - b.pad, b.x1 + dx + b.pad, b.y0 + dy - b.pad, b.y1 + dy + b.pad);
  }

  /** Marks the bands from `y0` to `y1` as taken from `x0` to `x1`. */
  span(x0: number, x1: number, y0: number, y1: number): void {
    const from = Math.floor(y0 / BAND);
    const to = Math.max(from, Math.ceil(y1 / BAND) - 1);
    this.reach(from, to);
    for (let b = from; b <= to; b++) {
      const i = b - this.first;
      if (x0 < this.lo[i]) this.lo[i] = x0;
      if (x1 > this.hi[i]) this.hi[i] = x1;
    }
  }

  private reach(from: number, to: number): void {
    if (!this.lo.length) {
      this.first = from;
      for (let b = from; b <= to; b++) {
        this.lo.push(Infinity);
        this.hi.push(-Infinity);
      }
      return;
    }
    if (from < this.first) {
      const n = this.first - from;
      this.lo = [...new Array<number>(n).fill(Infinity), ...this.lo];
      this.hi = [...new Array<number>(n).fill(-Infinity), ...this.hi];
      this.first = from;
    }
    for (let b = this.first + this.lo.length; b <= to; b++) {
      this.lo.push(Infinity);
      this.hi.push(-Infinity);
    }
  }

  /** How far `other` has to move right to stand clear on this one's right; -Infinity when they share no band. */
  pushRight(other: Contour): number {
    let push = -Infinity;
    const from = Math.max(this.first, other.first);
    const to = Math.min(this.first + this.lo.length, other.first + other.lo.length);
    for (let b = from; b < to; b++) {
      const d = this.hi[b - this.first] - other.lo[b - other.first];
      if (d > push) push = d;
    }
    return push;
  }

  /** How far `other` has to move left to stand clear on this one's left; -Infinity when they share no band. */
  pushLeft(other: Contour): number {
    let push = -Infinity;
    const from = Math.max(this.first, other.first);
    const to = Math.min(this.first + this.lo.length, other.first + other.lo.length);
    for (let b = from; b < to; b++) {
      const d = other.hi[b - other.first] - this.lo[b - this.first];
      if (d > push) push = d;
    }
    return push;
  }
}
