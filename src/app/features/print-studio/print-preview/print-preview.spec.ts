import { TestBed } from '@angular/core/testing';
import { sampleDocument } from '../../../core/model/sample';
import { DEFAULT_PRINT } from '../../../core/model/types';
import { NamesStyle, renderPoster } from '../../../core/poster/poster';
import { BoxesPlaced, PrintPreview, alignBox, anchorOf, distanceTo, movedBox, placedSettings, tidied } from './print-preview';

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

describe('alignBox', () => {
  // A page half as wide again as it is tall, with a margin of 5% of its height all round.
  const ratio = 1.5;
  const inner = { x: 0.05 / ratio, y: 0.05, w: 1 - 0.1 / ratio, h: 0.9 };
  const size = { w: 0.2, h: 0.1 };

  it('pulls a box nearly on the margin onto it, and one nearly in the middle into the middle', () => {
    const onMargin = alignBox({ ...size, x: inner.x + 0.004, y: 0.4 }, inner, ratio).box;
    expect(onMargin.x).toBeCloseTo(inner.x, 6);
    const middle = alignBox({ ...size, x: 0.4 + 0.006, y: 0.3 }, inner, ratio).box;
    expect(middle.x).toBeCloseTo(0.4, 6);
  });

  it('gives a box near a corner the same margin to the side as to the foot, and marks the two lines', () => {
    // 6% of the height from the foot, nearly as far from the left side.
    const y = inner.y + inner.h - size.h - 0.06;
    const { box, guides } = alignBox({ ...size, x: inner.x + 0.065 / ratio, y }, inner, ratio);
    expect((box.x - inner.x) * ratio).toBeCloseTo(0.06, 6);
    expect(box.y).toBe(y);
    expect(guides.slice(0, 2).every((g) => g.equal)).toBe(true);
    // From the box's bottom left corner: one line to the left margin, one down to the foot.
    expect(guides[0]).toMatchObject({ x1: box.x, y1: y + size.h, x2: inner.x, y2: y + size.h });
    expect(guides[1]).toMatchObject({ x1: box.x, y1: y + size.h, x2: box.x, y2: inner.y + inner.h });
  });

  it('pulls a box into a corner where the page holds it there, clear of the frame, from the margin or from near that place', () => {
    const clear = { x: 0.02 / ratio, y: 0.02 };
    const right = inner.x + inner.w - size.w - clear.x;
    const foot = inner.y + inner.h - size.h - clear.y;
    // On the margin at the foot, nearly on it at the right.
    expect(alignBox({ ...size, x: inner.x + inner.w - size.w - 0.003, y: inner.y + inner.h - size.h }, inner, ratio, true, clear).box).toMatchObject({
      x: right,
      y: foot,
    });
    // Nearly where the corner holds it.
    expect(alignBox({ ...size, x: right - 0.004, y: foot + 0.005 }, inner, ratio, true, clear).box).toMatchObject({ x: right, y: foot });
    // Along a side there is no flourish to keep clear of: on the margin, as ever.
    expect(alignBox({ ...size, x: inner.x + 0.004, y: 0.4 }, inner, ratio, true, clear).box.x).toBeCloseTo(inner.x, 6);
  });

  it('leaves the box where it is put when not snapping, and still shows how far it is from the margin', () => {
    const at = { ...size, x: inner.x + 0.004, y: 0.4 };
    const { box, guides } = alignBox(at, inner, ratio, false);
    expect(box).toEqual(at);
    expect(guides.length).toBeGreaterThanOrEqual(2);
    expect(guides[0].equal).toBe(false);
  });
});

describe('distanceTo', () => {
  // Down from the parents, along a bar, down to the child.
  const line = [
    { x: 0, y: 0 },
    { x: 0, y: 40 },
    { x: 100, y: 40 },
    { x: 100, y: 80 },
  ];

  it('is nothing on the line and the shortest way to it beside it', () => {
    expect(distanceTo(line, { x: 0, y: 20 })).toBe(0);
    expect(distanceTo(line, { x: 60, y: 40 })).toBe(0);
    expect(distanceTo(line, { x: 60, y: 46 })).toBeCloseTo(6);
    expect(distanceTo(line, { x: -3, y: 10 })).toBeCloseTo(3);
  });

  it('measures past an end to the end itself', () => {
    expect(distanceTo(line, { x: 100, y: 90 })).toBeCloseTo(10);
    expect(distanceTo(line, { x: -3, y: -4 })).toBeCloseTo(5);
    expect(distanceTo([{ x: 5, y: 5 }], { x: 5, y: 5 })).toBe(Infinity);
  });
});

describe('a box moved in the preview', () => {
  const legend = { x: 0.1, y: 0.7, w: 0.3, h: 0.2, free: false };
  /** A page with a title, a tree and the families' names, each in its group. */
  const PAGE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 1000"><g class="pp-title"><text>Title</text></g>' +
    '<g class="chart"><g class="card" data-person="I1" transform="translate(10,10)"></g></g><g class="pp-legend"><text>Names</text></g></svg>';
  /** The names drawn into a box: where and how, for the test to read back. */
  const namesIn = (b: { x: number; y: number; w: number; h: number }, style: NamesStyle = {}) =>
    `<text data-box="${[b.x, b.y, b.w, b.h].map((v) => v.toFixed(3)).join(' ')}" data-align="${style.align ?? ''}">Names</text>`;

  async function preview() {
    localStorage.clear();
    localStorage.setItem('stemma.prefs.v1', JSON.stringify({ language: 'en' }));
    await TestBed.configureTestingModule({ imports: [PrintPreview] }).compileComponents();
    const fixture = TestBed.createComponent(PrintPreview);
    const placed: BoxesPlaced[] = [];
    const asked: string[] = [];
    fixture.componentInstance.boxesPlace.subscribe((p) => placed.push(p));
    fixture.componentInstance.apply.subscribe(() => asked.push('apply'));
    fixture.componentInstance.discard.subscribe(() => asked.push('discard'));
    fixture.componentRef.setInput('svg', PAGE);
    fixture.componentRef.setInput('width', 1500);
    fixture.componentRef.setInput('height', 1000);
    fixture.componentRef.setInput('legend', legend);
    fixture.componentRef.setInput('title', { x: 0.3, y: 0.05, w: 0.4, h: 0.08, free: false });
    fixture.componentRef.setInput('namesIn', namesIn);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const box = () => el.querySelector<HTMLElement>('.page-box:not(.title-box)')!;
    const press = async (key: string, on: HTMLElement = box(), shiftKey = false) => {
      on.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
      await fixture.whenStable();
    };
    const set = async (name: string, value: unknown) => {
      fixture.componentRef.setInput(name, value);
      await fixture.whenStable();
    };
    return { fixture, el, box, press, set, placed, asked };
  }

  it('asks for a box to wait where it was put, and shows it there, its names drawn into it and the cards as they were', async () => {
    const { el, box, press, set, placed } = await preview();
    await press('ArrowRight');
    // Asked to wait (moved, not only made bigger), and nothing drawn yet: the page shows the box where it is.
    expect(placed).toEqual([{ legendBox: { x: expect.closeTo(0.11), y: 0.7, w: 0.3, h: 0.2 }, legendSizedOnly: false }]);
    expect(box().style.left).toBe('10%');
    expect(el.querySelector('.moved-bar')).toBeNull();
    // The studio has it wait: shown there, with its names drawn into it, and the bar to apply or discard it.
    await set('staged', { legend: { x: 0.11, y: 0.7, w: 0.3, h: 0.2 } });
    await set('waiting', true);
    expect(box().style.left).toBe('11%');
    expect(box().classList.contains('pending')).toBe(true);
    expect(el.querySelector('g.pp-legend text')!.getAttribute('data-box')).toBe('0.110 0.700 0.300 0.200');
    expect(el.querySelector('g.card')!.getAttribute('transform')).toBe('translate(10,10)');
    expect(el.querySelector('g.pp-title')!.hasAttribute('transform')).toBe(false);
    expect(el.querySelector('.moved-bar')).not.toBeNull();
    // Nothing waits any more: the names as the page drew them.
    await set('staged', {});
    await set('waiting', false);
    expect(el.querySelector('g.pp-legend')!.innerHTML).toBe('<text>Names</text>');
    expect(el.querySelector('.moved-bar')).toBeNull();
  });

  it('applies or discards what waits from the bar, and applies it with Enter on a box', async () => {
    const { el, press, set, asked } = await preview();
    await set('waiting', true);
    el.querySelector<HTMLButtonElement>('.moved-bar .btn.primary')!.click();
    [...el.querySelectorAll<HTMLButtonElement>('.moved-bar button')].find((b) => b.textContent?.includes('Discard'))!.click();
    await press('Enter');
    expect(asked).toEqual(['apply', 'discard', 'apply']);
  });

  it('draws the names into a box live while it is made bigger or smaller, in the corner they stand in', async () => {
    const { fixture, el, box, set, placed } = await preview();
    await set('namesStyle', { align: 'top-right', cm: 0.6 });
    // A corner dragged: the names follow every move of the pointer, before anything is let go.
    const sheet = el.querySelector<HTMLElement>('.sheet')!;
    sheet.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 1500, height: 1000, right: 1500, bottom: 1000, toJSON: () => ({}) });
    const corner = box().querySelector<HTMLElement>('.corner.se')!;
    const pointer = (type: string, x: number, y: number) => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
      Object.assign(e, { pointerId: 1 });
      return e;
    };
    box().setPointerCapture = () => undefined;
    corner.dispatchEvent(pointer('pointerdown', 600, 900));
    box().dispatchEvent(pointer('pointermove', 750, 950));
    await fixture.whenStable();
    expect(el.querySelector('g.pp-legend text')!.getAttribute('data-box')).toBe('0.100 0.700 0.400 0.250');
    expect(el.querySelector('g.pp-legend text')!.getAttribute('data-align')).toBe('top-right');
    box().dispatchEvent(pointer('pointerup', 750, 950));
    await fixture.whenStable();
    // Let go: asked to wait, made bigger only (it stays held where it is held).
    expect(placed).toEqual([{ legendBox: { x: 0.1, y: 0.7, w: expect.closeTo(0.4), h: expect.closeTo(0.25) }, legendSizedOnly: true }]);
  });

  it('moves the title with its box and makes it bigger or smaller with it', async () => {
    const { el, set } = await preview();
    // Held top right and a third bigger.
    await set('staged', { title: { x: 0.43, y: 0.05, w: 0.4 * 1.5, h: 0.12 } });
    const t = el.querySelector('g.pp-title')!.getAttribute('transform');
    expect(t).toBe('translate(1095 110) scale(1.5) translate(-750 -90)');
  });

  it('holds a title let go of where it snapped to a place along the top, so the settings show that place', async () => {
    const { fixture, el, set, placed } = await preview();
    await set('inner', { x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    const sheet = el.querySelector<HTMLElement>('.sheet')!;
    sheet.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 1500, height: 1000, right: 1500, bottom: 1000, toJSON: () => ({}) });
    const title = el.querySelector<HTMLElement>('.title-box')!;
    title.setPointerCapture = () => undefined;
    const pointer = (type: string, x: number, y: number) => {
      const e = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
      Object.assign(e, { pointerId: 1 });
      return e;
    };
    // Dragged near the right margin: pulled onto it, and held at the top right.
    title.dispatchEvent(pointer('pointerdown', 700, 100));
    title.dispatchEvent(pointer('pointermove', 1084, 100));
    title.dispatchEvent(pointer('pointerup', 1084, 100));
    await fixture.whenStable();
    expect(placed.at(-1)?.titleAnchor).toBe('top-right');
    expect(placedSettings(placed.at(-1)!)).toEqual({ titleAt: undefined, titleAnchor: 'top-right' });
    // Left somewhere else: where it was put.
    title.dispatchEvent(pointer('pointerdown', 700, 100));
    title.dispatchEvent(pointer('pointermove', 900, 300));
    title.dispatchEvent(pointer('pointerup', 900, 300));
    await fixture.whenStable();
    expect(placed.at(-1)?.titleAnchor).toBeUndefined();
  });

  it('asks for a box put back where the page has it, from its cross', async () => {
    const { el, set, placed } = await preview();
    await set('legend', { ...legend, free: true });
    el.querySelector<HTMLButtonElement>('.page-box:not(.title-box) .box-reset')!.click();
    expect(placed).toEqual([{ legendBox: null }]);
  });
});

describe('placedSettings', () => {
  const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.2 };

  it('lets go of the anchor of what was dragged, and keeps that of a box only made bigger or smaller', () => {
    expect(placedSettings({ legendBox: box, legendSizedOnly: false })).toEqual({ legendBox: box, legendAnchor: undefined });
    expect(placedSettings({ legendBox: box, legendSizedOnly: true })).toEqual({ legendBox: box });
    expect(placedSettings({ titleAt: { x: 0.5, y: 0.1 } })).toEqual({ titleAt: { x: 0.5, y: 0.1 }, titleAnchor: undefined });
    expect('legendAnchor' in placedSettings({ legendBox: box, legendSizedOnly: true })).toBe(false);
  });

  it('holds a box let go of at one of the places of the page there, as if that place were picked', () => {
    expect(placedSettings({ legendBox: box, legendSizedOnly: false, legendAnchor: 'bottom-right' })).toEqual({ legendBox: box, legendAnchor: 'bottom-right' });
    expect(placedSettings({ titleAt: { x: 0.5, y: 0.05 }, titleAnchor: 'top' })).toEqual({ titleAt: undefined, titleAnchor: undefined });
    expect(placedSettings({ titleAt: { x: 0.2, y: 0.05 }, titleAnchor: 'top-left' })).toEqual({ titleAt: undefined, titleAnchor: 'top-left' });
  });

  it('puts either back where the page has it by itself: neither placed by hand nor held', () => {
    expect(placedSettings({ legendBox: null })).toEqual({ legendBox: undefined, legendAnchor: undefined });
    expect(placedSettings({ titleAt: null })).toEqual({ titleAt: undefined, titleAnchor: undefined });
    expect(placedSettings({})).toEqual({});
  });
});

describe('anchorOf', () => {
  const inner = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };

  it('names the place of the page a box stands at inside the margin', () => {
    expect(anchorOf({ x: 0.05, y: 0.05, w: 0.2, h: 0.1 }, inner)).toBe('top-left');
    expect(anchorOf({ x: 0.4, y: 0.05, w: 0.2, h: 0.1 }, inner)).toBe('top');
    expect(anchorOf({ x: 0.75, y: 0.85, w: 0.2, h: 0.1 }, inner)).toBe('bottom-right');
    expect(anchorOf({ x: 0.05, y: 0.45, w: 0.2, h: 0.1 }, inner)).toBe('left');
    expect(anchorOf({ x: 0.4, y: 0.45, w: 0.2, h: 0.1 }, inner)).toBe('center');
  });

  it('names a corner only where the page holds a box there, clear of the frame', () => {
    const clear = { x: 0.02, y: 0.03 };
    expect(anchorOf({ x: 0.07, y: 0.08, w: 0.2, h: 0.1 }, inner, clear)).toBe('top-left');
    expect(anchorOf({ x: 0.73, y: 0.82, w: 0.2, h: 0.1 }, inner, clear)).toBe('bottom-right');
    // On the margin in the corner (put there with Alt): not held.
    expect(anchorOf({ x: 0.05, y: 0.05, w: 0.2, h: 0.1 }, inner, clear)).toBeUndefined();
    // Along a side: on the margin, as ever.
    expect(anchorOf({ x: 0.4, y: 0.05, w: 0.2, h: 0.1 }, inner, clear)).toBe('top');
    expect(anchorOf({ x: 0.05, y: 0.45, w: 0.2, h: 0.1 }, inner, clear)).toBe('left');
  });

  it('names none for a box anywhere else', () => {
    expect(anchorOf({ x: 0.2, y: 0.05, w: 0.2, h: 0.1 }, inner)).toBeUndefined();
    expect(anchorOf({ x: 0.05, y: 0.3, w: 0.2, h: 0.1 }, inner)).toBeUndefined();
  });
});

describe('tidied', () => {
  it('drops what a drag put in and left over, and keeps the bends the line had', () => {
    const a = { x: 0, y: 0 };
    const bend = { x: 0, y: 20 };
    const c = { x: 0, y: 40 };
    const stub = { x: 0, y: 30 };
    const twice = { x: 0, y: 40 };
    const d = { x: 80, y: 40 };
    expect(tidied([a, bend, stub, c, twice, d], new Set([bend, c]))).toEqual([a, bend, c, d]);
  });
});

describe("the families' names snapped into a corner and applied", () => {
  const measure = (t: string, font: string) => t.length * Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 12) * 0.5;
  const render = (settings = {}) =>
    renderPoster({
      doc: sampleDocument(),
      settings: { ...DEFAULT_PRINT, paper: 'A3', orientation: 'landscape', ...settings },
      measure,
      now: new Date('2026-01-01T00:00:00Z'),
    });

  it('stay where they snapped, on a page with a frame and without', () => {
    for (const showFrame of [true, false]) {
      const page = render({ showFrame });
      const { inner, cornerClear } = page;
      const l = page.legend!;
      expect(cornerClear.x > 0).toBe(showFrame);
      // Dragged onto the margin in the bottom right corner.
      const dropped = { x: inner.x + inner.w - l.w, y: inner.y + inner.h - l.h, w: l.w, h: l.h };
      const snapped = alignBox(dropped, inner, page.width / page.height, true, cornerClear).box;
      const legendAnchor = anchorOf(snapped, inner, cornerClear);
      expect(legendAnchor).toBe('bottom-right');
      const applied = render({ showFrame, ...placedSettings({ legendBox: snapped, legendAnchor }) }).legend!;
      expect(applied.x).toBeCloseTo(snapped.x, 4);
      expect(applied.y).toBeCloseTo(snapped.y, 4);
    }
  });
});
