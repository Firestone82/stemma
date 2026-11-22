import { TestBed } from '@angular/core/testing';
import { sampleDocument } from '../core/model/sample';
import { updatePrint } from '../core/model/operations';
import { TreeStore } from '../core/store/tree-store';
import { UiState } from './ui-state';

describe('undo and redo in the print studio', () => {
  let ui: UiState;
  let store: TreeStore;
  const paper = () => store.doc().print?.paper;

  beforeEach(() => {
    store = TestBed.inject(TreeStore);
    ui = TestBed.inject(UiState);
    store.load(sampleDocument());
    ui.clearPrintOmitted();
  });

  it('brings back the people of the last click, all of them at once, and leaves them out again', () => {
    ui.omitFromPrint(['I29']);
    ui.omitFromPrint(['I20', 'I25', 'I27', 'I28']);
    expect(ui.printOmitted()).toHaveLength(5);
    ui.undoInPrint();
    expect(ui.printOmitted()).toEqual(['I29']);
    ui.redoInPrint();
    expect(ui.printOmitted()).toEqual(['I29', 'I20', 'I25', 'I27', 'I28']);
    ui.undoInPrint();
    ui.undoInPrint();
    expect(ui.printOmitted()).toEqual([]);
    expect(ui.canRedoInPrint()).toBe(true);
    // Someone already left out is not counted twice.
    ui.omitFromPrint(['I29']);
    ui.omitFromPrint(['I29', 'I21']);
    ui.undoInPrint();
    expect(ui.printOmitted()).toEqual(['I29']);
  });

  it('goes back through clicks and changes to the page in the order they were made', () => {
    store.update((doc) => updatePrint(doc, { paper: 'A2' }));
    ui.omitFromPrint(['I29']);
    store.update((doc) => updatePrint(doc, { paper: 'A1' }));
    ui.printEdited();
    // The paper last, then the click, then the paper before it.
    ui.undoInPrint();
    expect(paper()).toBe('A2');
    expect(ui.printOmitted()).toEqual(['I29']);
    ui.undoInPrint();
    expect(ui.printOmitted()).toEqual([]);
    expect(paper()).toBe('A2');
    ui.undoInPrint();
    expect(paper()).not.toBe('A2');
    expect(ui.canUndoInPrint()).toBe(false);
    // And forward again the same way round.
    ui.redoInPrint();
    expect(paper()).toBe('A2');
    expect(ui.printOmitted()).toEqual([]);
    ui.redoInPrint();
    expect(ui.printOmitted()).toEqual(['I29']);
    expect(paper()).toBe('A2');
    ui.redoInPrint();
    expect(paper()).toBe('A1');
    expect(ui.canRedoInPrint()).toBe(false);
  });

  it('forgets what could be left out again once the page is changed, and everything when everyone is brought back', () => {
    ui.omitFromPrint(['I29']);
    ui.undoInPrint();
    store.update((doc) => updatePrint(doc, { paper: 'A2' }));
    ui.printEdited();
    ui.redoInPrint();
    expect(ui.printOmitted()).toEqual([]);
    ui.omitFromPrint(['I29']);
    ui.clearPrintOmitted();
    ui.undoInPrint();
    // Nothing of the clicks is left: the paper goes back.
    expect(ui.printOmitted()).toEqual([]);
    expect(paper()).not.toBe('A2');
  });

  it('brings people back onto the print from a card menu, and undo still goes back through the clicks as they were', () => {
    ui.omitFromPrint(['I29']);
    ui.omitFromPrint(['I20', 'I25']);
    ui.omitFromPrint(['I27']);
    ui.keepInPrint(['I25', 'I27']);
    expect(ui.printOmitted()).toEqual(['I29', 'I20']);
    ui.undoInPrint();
    expect(ui.printOmitted()).toEqual(['I29']);
    ui.undoInPrint();
    expect(ui.printOmitted()).toEqual([]);
  });
});

describe('Ctrl+F', () => {
  let ui: UiState;
  let store: TreeStore;

  beforeEach(() => {
    store = TestBed.inject(TreeStore);
    ui = TestBed.inject(UiState);
    store.load(sampleDocument());
  });

  it('goes back to the overview and asks for the search field', () => {
    store.selectPerson('I29');
    ui.find();
    expect(store.selection()).toBeNull();
    expect(ui.findRequested()).toBe(true);
  });
});
