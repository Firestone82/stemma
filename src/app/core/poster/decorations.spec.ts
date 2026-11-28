import { drawBotanicalBorder } from './decoration-border';
import { drawDecorations } from './decorations';

describe('poster decorations', () => {
  const page = { x: 0, y: 0, w: 600, h: 400 };

  it('decorates several separate gaps on a large tree with open branch linework', () => {
    const wide = { ...page, w: 900 };
    const barriers = [120, 270, 420, 570, 720, 870].map((x) => ({ x, y: 160, w: 40, h: 80 }));
    const occupied = [{ ...wide, h: 160 }, { ...wide, y: 240, h: 160 }, ...barriers];
    const svg = drawDecorations(wide, occupied, [], { count: 150, width: 30 });
    const positions = [...svg.matchAll(/class="pp-decoration pp-decoration-ornament" transform="translate\(([\d.]+),([\d.]+)\)/g)];
    const gaps = positions.map(([, x, y]) => {
      expect(Number(y)).toBeGreaterThan(160);
      expect(Number(y)).toBeLessThan(240);
      expect(barriers.every((b) => Number(x) < b.x || Number(x) > b.x + b.w)).toBe(true);
      return barriers.filter((b) => Number(x) > b.x).length;
    });
    expect([...gaps].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(svg).not.toMatch(/<circle|<image|<rect/);
  });

  it('uses a faint watermark in a tight gap clear of the chart', () => {
    const occupied = [
      { ...page, w: 285 },
      { ...page, x: 315, w: 285 },
    ];
    const svg = drawDecorations(page, occupied, [], { count: 48, width: 80 });
    expect(svg).toContain('pp-decoration-watermark');
    expect(svg).not.toContain('pp-decoration-ornament');
  });

  it('omits all decoration when cards and lines occupy the page', () => {
    expect(drawBotanicalBorder(page, [page], [])).toBe('');
    expect(drawDecorations(page, [page], [], { count: 48, width: 80 })).toBe('');
  });

  it('moves the border branch to the clear side when a line is close to the other edge', () => {
    const line = { x: 4, y: 0, w: 1, h: page.h };
    const svg = drawBotanicalBorder(page, [line], []);
    expect(svg).toMatch(/data-decoration="edge-branch" transform="translate\(600,[\d.]+\) scale\(-/);
  });

  it('omits the watermark when there is no room clear of page lettering', () => {
    expect(drawDecorations(page, [page], [page], { count: 48, width: 80 })).toBe('');
  });
});
