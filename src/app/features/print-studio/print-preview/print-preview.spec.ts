import { movedBox } from './print-preview';

describe('movedBox', () => {
  const start = { x: 0.1, y: 0.7, w: 0.3, h: 0.2 };

  it('moves the box, keeping it on the page', () => {
    expect(movedBox(start, 'move', 0.1, -0.1)).toEqual({ x: expect.closeTo(0.2), y: expect.closeTo(0.6), w: 0.3, h: 0.2 });
    expect(movedBox(start, 'move', 5, 5)).toEqual({ x: 0.7, y: expect.closeTo(0.8), w: 0.3, h: 0.2 });
  });

  it('resizes from a corner, the opposite corner staying put, never smaller than a little', () => {
    const se = movedBox(start, 'se', 0.1, 0.05);
    expect(se.x).toBe(0.1);
    expect(se.w).toBeCloseTo(0.4);
    expect(se.h).toBeCloseTo(0.25);
    const nw = movedBox(start, 'nw', 1, 1);
    expect(nw.x + nw.w).toBeCloseTo(0.4);
    expect(nw.w).toBeCloseTo(0.04);
    expect(nw.h).toBeCloseTo(0.04);
  });
});
