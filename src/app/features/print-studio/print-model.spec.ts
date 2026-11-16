import { sampleDocument } from '../../core/model/sample';
import { updatePrint } from '../../core/model/operations';
import { DEFAULT_PRINT, PrintSettings, TreeDocument, effectivePrint } from '../../core/model/types';
import { PosterInput } from '../../core/poster/poster';
import { minCardMm, onlyTyped, paperFor } from './print-model';

describe('telling typing from other changes of the print settings', () => {
  const asked = (doc: TreeDocument, more: Partial<PosterInput> = {}): PosterInput => ({
    doc,
    settings: { ...DEFAULT_PRINT, ...effectivePrint(doc) },
    language: 'en',
    measure: () => 0,
    omit: new Set(),
    ...more,
  });
  const change = (doc: TreeDocument, patch: Partial<PrintSettings>): TreeDocument => ({
    ...updatePrint(doc, patch),
    // Every change stamps the tree.
    meta: { ...doc.meta, modified: new Date(Date.parse(doc.meta.modified ?? '2026-01-01') + 1000).toISOString() },
  });

  it('takes a change of the title, the line under it or a size for typing', () => {
    const doc = sampleDocument();
    expect(onlyTyped(asked(doc), asked(change(doc, { title: 'T' })))).toBe(true);
    expect(onlyTyped(asked(change(doc, { title: 'T' })), asked(change(doc, { title: 'Th', subtitle: 'x' })))).toBe(true);
    expect(onlyTyped(asked(doc), asked(change(doc, { titleSize: 2, legendSize: 0.7 })))).toBe(true);
  });

  it('takes anything else for a change the page should follow at once', () => {
    const doc = sampleDocument();
    expect(onlyTyped(asked(doc), asked(change(doc, { title: 'T', showFrame: !DEFAULT_PRINT.showFrame })))).toBe(false);
    expect(onlyTyped(asked(doc), asked(change(doc, { legendBox: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 } })))).toBe(false);
    expect(onlyTyped(asked(doc), asked(doc, { omit: new Set(['I20']) }))).toBe(false);
    expect(onlyTyped(asked(doc), asked(doc, { language: 'cs' }))).toBe(false);
    expect(onlyTyped(asked(doc), asked({ ...doc, people: doc.people.slice(1) }))).toBe(false);
    expect(onlyTyped(asked(doc), asked({ ...doc, meta: { ...doc.meta, title: 'Another tree' } }))).toBe(false);
  });
});

describe('how small a card may be', () => {
  it('wants smaller cards on smaller paper and bigger on bigger, 40 mm on A1', () => {
    const [a4, a3, a2, a1, a0] = [210, 297, 420, 594, 841].map((short) => minCardMm(short));
    expect(a1).toBe(40);
    expect([a4, a3, a2, a1, a0]).toEqual([...[a4, a3, a2, a1, a0]].sort((x, y) => x - y));
    expect(a4).toBeLessThan(30);
    expect(a0).toBeGreaterThan(42);
    // A card without the shield is narrower, and may be as much narrower on paper.
    expect(minCardMm(594, 154)).toBe(Math.round(40 * (154 / 188)));
  });

  it('suggests the smallest paper on which the cards come out as big as that paper wants', () => {
    // 30 mm cards on A1 landscape: about 42 mm on A0, which wants 46. Nothing up to A0 will do.
    expect(paperFor(841, 594, 30)).toBeUndefined();
    // 38 mm on A1: 54 on A0, enough there.
    expect(paperFor(841, 594, 38)?.id).toBe('A0');
    // 25 mm on A4: 35 on A3, which wants 30.
    expect(paperFor(210, 297, 25)?.id).toBe('A3');
  });
});
