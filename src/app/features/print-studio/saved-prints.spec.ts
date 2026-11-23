import { TestBed } from '@angular/core/testing';
import { sampleDocument } from '../../core/model/sample';
import { forgetPrintFor, savePrintFor, updatePrint } from '../../core/model/operations';
import { DEFAULT_PRINT, PrintSettings } from '../../core/model/types';
import { TreeStore } from '../../core/store/tree-store';
import { parseTree } from '../../core/xml/parser';
import { serializeTree } from '../../core/xml/serializer';
import { PrintModel } from './print-model';

const settings = (patch: Partial<PrintSettings>): PrintSettings => ({ ...DEFAULT_PRINT, ...patch });

describe('print settings saved for a person', () => {
  it('keeps one for each person, the last saved', () => {
    let doc = savePrintFor(sampleDocument(), settings({ centerId: 'I3', paper: 'A1' }));
    doc = savePrintFor(doc, settings({ centerId: 'I5', paper: 'A2' }));
    doc = savePrintFor(doc, settings({ centerId: 'I3', paper: 'A0' }));
    expect(doc.savedPrints?.map((s) => [s.centerId, s.paper])).toEqual([
      ['I5', 'A2'],
      ['I3', 'A0'],
    ]);
    doc = forgetPrintFor(forgetPrintFor(doc, 'I3'), 'I5');
    expect(doc.savedPrints).toBeUndefined();
  });

  it('are written into the file and read back, for people still in the tree', () => {
    let doc = savePrintFor(sampleDocument(), settings({ centerId: 'I3', paper: 'A1', title: 'For Anna', moves: { I4: { x: 10, y: -5 } } }));
    doc = savePrintFor(doc, settings({ centerId: 'nobody-here', paper: 'A2' }));
    const xml = serializeTree(doc);
    expect(xml).toContain('<savedPrints>');
    const back = parseTree(xml).doc;
    expect(back.savedPrints).toHaveLength(1);
    expect(back.savedPrints?.[0]).toEqual(doc.savedPrints?.[0]);
    // The print as it is stays as it was.
    expect(back.print).toEqual(doc.print);
  });

  it('come back when that person is chosen for the middle, and can be saved again or forgotten', () => {
    const store = TestBed.inject(TreeStore);
    const model = TestBed.inject(PrintModel);
    store.load(updatePrint(sampleDocument(), { paper: 'A3' }));
    model.chooseMiddle('I3');
    expect(model.saved()).toBeUndefined();
    model.set({ paper: 'A1', showFrame: false });
    model.saveForMiddle();
    expect(model.saved()?.paper).toBe('A1');
    expect(model.savedDiffers()).toBe(false);

    // Someone else, with nothing saved: only the middle changes.
    model.chooseMiddle('I5');
    expect([store.doc().print?.centerId, store.doc().print?.paper]).toEqual(['I5', 'A1']);
    model.set({ paper: 'A4', showFrame: true });

    // Back to the first: their settings again.
    model.chooseMiddle('I3');
    expect([store.doc().print?.paper, store.doc().print?.showFrame]).toEqual(['A1', false]);

    model.set({ paper: 'A2' });
    expect(model.savedDiffers()).toBe(true);
    model.useSaved();
    expect(store.doc().print?.paper).toBe('A1');
    model.forgetSaved();
    expect(model.saved()).toBeUndefined();
  });
});
