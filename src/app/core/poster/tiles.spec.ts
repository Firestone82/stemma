import { pdfPages, tilePages } from './pdf';
import { TILE_MARGIN_MM, TILE_OVERLAP_MM, tileGrid, tileName } from './tiles';

describe('tileGrid', () => {
  it('makes one paper out of the sheets, as the A sizes halve: A2 from 2 × A3, A1 from 4 × A3 or 8 × A4', () => {
    const a2 = tileGrid(594, 420, 'A3')!;
    expect([a2.cols, a2.rows, a2.landscape]).toEqual([2, 1, false]);
    const a1 = tileGrid(841, 594, 'A3')!;
    expect([a1.cols, a1.rows, a1.landscape]).toEqual([2, 2, true]);
    expect(tileGrid(841, 594, 'A4')!.tiles.length).toBe(8);
    expect(tileGrid(594, 420, 'A4')!.tiles.length).toBe(4);
    // Inside the printers' edge the poster is drawn a little smaller; printing to the edge, at full size.
    expect(a2.scale).toBeGreaterThan(0.9);
    expect(a2.scale).toBeLessThan(1);
    const edge = tileGrid(594, 420, 'A3', true)!;
    expect([edge.cols, edge.rows, edge.margin, edge.overlap]).toEqual([2, 1, 0, TILE_OVERLAP_MM]);
    expect(edge.scale).toBeGreaterThan(0.98);
    expect(edge.scale).toBeGreaterThan(a2.scale);
  });

  it('covers the whole poster, neighbours sharing the overlap, each part inside the margin', () => {
    const g = tileGrid(841, 594, 'A4')!;
    const area = { w: g.sheetW - 2 * TILE_MARGIN_MM, h: g.sheetH - 2 * TILE_MARGIN_MM };
    for (const t of g.tiles) {
      expect(t.w * g.scale).toBeLessThanOrEqual(area.w + 1e-9);
      expect(t.h * g.scale).toBeLessThanOrEqual(area.h + 1e-9);
      const right = g.tiles.find((u) => u.row === t.row && u.col === t.col + 1);
      if (right) expect((t.x + t.w - right.x) * g.scale).toBeCloseTo(TILE_OVERLAP_MM);
    }
    const last = g.tiles[g.tiles.length - 1];
    expect(last.x + last.w).toBeCloseTo(841);
    expect(last.y + last.h).toBeLessThanOrEqual(594 + 1e-9);
    expect(Math.max(...g.tiles.map((t) => t.y + t.h))).toBeCloseTo(594);
  });

  it('needs no pieces when the sheet is as big as the poster', () => {
    expect(tileGrid(297, 420, 'A3')).toBeNull();
    expect(tileGrid(210, 297, 'A3')).toBeNull();
  });

  it('names sheets as on a map', () => {
    expect([tileName({ col: 0, row: 0 }), tileName({ col: 1, row: 2 }), tileName({ col: 26, row: 0 })]).toEqual(['A1', 'B3', 'AA1']);
  });

  it('makes a PDF page for each sheet, all drawing the one picture', async () => {
    const g = tileGrid(841, 594, 'A3')!;
    const pages = tilePages(g, 841, 594);
    expect(pages.length).toBe(4);
    expect(pages[0].content).toContain('/Im0 Do');
    expect(pages[0].content).toContain('(B1 >)');
    expect(pages[0].content).toContain('(A2)');
    expect(pages[3].content).not.toContain('>)');
    // Printing to the edge: no corner marks, the names in the shared strip on white.
    const edge = tilePages(tileGrid(841, 594, 'A3', true)!, 841, 594)[0].content;
    expect(edge).toContain('(B1 >)');
    expect(edge).toContain('1 g');
    const pdf = await pdfPages(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 10, 10, pages, 'Test').text();
    expect(pdf).toContain('/Count 4');
    expect(pdf.match(/\/Type \/Page /g)?.length).toBe(4);
    expect(pdf.match(/\/Subtype \/Image/g)?.length).toBe(1);
  });
});
