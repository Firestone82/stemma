import { TestBed } from '@angular/core/testing';
import { sampleDocument } from '../../core/model/sample';
import { forgetPrintFor, savePrintFor, savedPrintOf, updatePrint } from '../../core/model/operations';
import { DEFAULT_PRINT, PrintSettings } from '../../core/model/types';
import { TreeStore } from '../../core/store/tree-store';
import { parseTree } from '../../core/xml/parser';
import { serializeTree } from '../../core/xml/serializer';
import { Shortcuts } from '../../state/shortcuts';
import { UiState } from '../../state/ui-state';
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

  it('belong to the couple: either partner finds them, and saving for one replaces what was kept for the other', () => {
    let doc = savePrintFor(sampleDocument(), settings({ centerId: 'I3', partnerId: 'I4', paper: 'A1' }));
    expect(savedPrintOf(doc, 'I4')?.paper).toBe('A1');
    expect(savedPrintOf(doc, 'I3')?.paper).toBe('A1');
    doc = savePrintFor(doc, settings({ centerId: 'I4', partnerId: 'I3', paper: 'A2' }));
    expect(doc.savedPrints).toHaveLength(1);
    expect(savedPrintOf(doc, 'I3')?.paper).toBe('A2');
    expect(forgetPrintFor(doc, 'I3').savedPrints).toBeUndefined();
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

    // Someone else, with nothing saved: every setting as it was before anything was chosen.
    model.chooseMiddle('I5');
    expect([store.doc().print?.centerId, store.doc().print?.paper, store.doc().print?.showFrame]).toEqual(['I5', DEFAULT_PRINT.paper, DEFAULT_PRINT.showFrame]);
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

describe('print settings saved for a couple in the studio', () => {
  it('come back when the partner is chosen for the middle', () => {
    const store = TestBed.inject(TreeStore);
    const model = TestBed.inject(PrintModel);
    store.load(sampleDocument());
    model.chooseMiddle('I22');
    model.set({ partnerId: 'I26', paper: 'A1' });
    model.saveForMiddle();
    expect(model.savedNames()).toHaveLength(2);
    model.chooseMiddle('I3');
    model.set({ paper: 'A4' });
    model.chooseMiddle('I26');
    expect([store.doc().print?.paper, store.doc().print?.centerId, store.doc().print?.partnerId]).toEqual(['A1', 'I22', 'I26']);
    expect(model.saved()?.paper).toBe('A1');
    model.forgetSaved();
    expect(store.doc().savedPrints).toBeUndefined();
  });
});

describe('print settings saved with the title and the families names placed by hand', () => {
  it('keeps what still waits to be applied, and brings it back', () => {
    const store = TestBed.inject(TreeStore);
    const model = TestBed.inject(PrintModel);
    store.load(sampleDocument());
    model.chooseMiddle('I3');
    model.set({ title: 'For Anna', subtitle: 'Her family' });
    const box = { x: 0.6, y: 0.7, w: 0.3, h: 0.2 };
    model.stage({ legendBox: box, legendAlign: 'top', legendSize: 0.8, titleSize: 2.4, titleAnchor: 'top-left', legendGap: 1 });
    expect(model.savedDiffers()).toBe(false);
    model.saveForMiddle();
    const kept = model.saved()!;
    expect([kept.title, kept.subtitle, kept.legendBox, kept.legendAlign, kept.legendSize, kept.titleSize, kept.titleAnchor, kept.legendGap]).toEqual([
      'For Anna',
      'Her family',
      box,
      'top',
      0.8,
      2.4,
      'top-left',
      1,
    ]);
    expect(model.waiting()).toBe(false);

    // Moved again without applying: that is a change from what is kept.
    model.stage({ legendBox: { x: 0, y: 0, w: 0.2, h: 0.2 } });
    expect(model.savedDiffers()).toBe(true);

    model.chooseMiddle('I5');
    model.set({ title: undefined, legendSize: undefined, titleSize: undefined, legendBox: undefined });
    model.chooseMiddle('I3');
    const print = store.doc().print!;
    expect([print.title, print.legendBox, print.legendSize, print.titleSize]).toEqual(['For Anna', box, 0.8, 2.4]);
    expect(model.waiting()).toBe(false);
  });
});

describe('Ctrl+S in the print studio', () => {
  it('saves the print for the couple in the middle, not the file', () => {
    const store = TestBed.inject(TreeStore);
    const model = TestBed.inject(PrintModel);
    const ui = TestBed.inject(UiState);
    store.load(sampleDocument());
    model.chooseMiddle('I3');
    model.set({ paper: 'A1' });
    model.stage({ titleSize: 2 });
    ui.printOpen.set(true);
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    TestBed.inject(Shortcuts).handle(event);
    expect(event.defaultPrevented).toBe(true);
    expect([model.saved()?.paper, model.saved()?.titleSize]).toEqual(['A1', 2]);
    ui.printOpen.set(false);
  });
});
