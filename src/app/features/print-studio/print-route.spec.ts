import { TestBed } from '@angular/core/testing';
import { sampleDocument } from '../../core/model/sample';
import { updatePrint } from '../../core/model/operations';
import { TreeStore } from '../../core/store/tree-store';
import { UiState } from '../../state/ui-state';
import { PrintRoute, changedKeys } from './print-route';

/** Goes back (or forward) in the history and waits for the page to hear of it. */
function go(steps: number): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
    history.go(steps);
  });
}

describe('the print studio in the address', () => {
  let store: TreeStore;
  let ui: UiState;
  const start = () => {
    TestBed.inject(PrintRoute);
    store.load(sampleDocument());
    TestBed.tick();
  };
  const change = (patch: Parameters<typeof updatePrint>[1]) => {
    store.update((doc) => updatePrint(doc, patch));
    TestBed.tick();
  };

  beforeEach(() => {
    history.replaceState(null, '', location.pathname);
    store = TestBed.inject(TreeStore);
    ui = TestBed.inject(UiState);
  });

  it('opens at #/print with the person, and each change of a setting is an entry of its own', async () => {
    start();
    const before = history.length;
    ui.printOpen.set(true);
    TestBed.tick();
    expect(location.hash).toBe('#/print?person=I11');
    change({ paper: 'A1' });
    expect(location.hash).toBe('#/print?person=I11&paper=A1');
    change({ centerId: 'I3' });
    expect(location.hash).toBe('#/print?person=I3&paper=A1');
    expect(history.length).toBe(before + 3);

    // Back goes through the prints as they were.
    await go(-1);
    TestBed.tick();
    // The home person again, named now.
    expect(store.doc().print?.centerId ?? 'I11').toBe('I11');
    expect(store.doc().print?.paper).toBe('A1');
    await go(-1);
    TestBed.tick();
    expect(store.doc().print?.paper).toBe('A3');
    expect(ui.printOpen()).toBe(true);
    // Forward brings the change back, and does not add an entry.
    await go(1);
    TestBed.tick();
    expect(store.doc().print?.paper).toBe('A1');
    expect(history.length).toBe(before + 3);
    // And past the first print, the studio is left.
    await go(-2);
    TestBed.tick();
    expect(ui.printOpen()).toBe(false);
  });

  it('keeps a quick run of changes of the same setting as one entry', () => {
    start();
    ui.printOpen.set(true);
    TestBed.tick();
    const before = history.length;
    change({ title: 'T' });
    change({ title: 'Th' });
    change({ title: 'The' });
    expect(history.length).toBe(before + 1);
    expect(location.hash).toBe('#/print?person=I11&title=The');
  });

  it('closing goes back to where the studio was opened from', async () => {
    start();
    ui.printOpen.set(true);
    TestBed.tick();
    change({ paper: 'A1' });
    const left = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
    ui.printOpen.set(false);
    TestBed.tick();
    await left;
    expect(location.hash).toBe('');
  });

  it('opens with the settings an address names once the tree is read', () => {
    history.replaceState(null, '', '#/print?person=I3&paper=A2&showFrame=false');
    start();
    expect(ui.printOpen()).toBe(true);
    const print = store.doc().print;
    expect([print?.centerId, print?.paper, print?.showFrame]).toEqual(['I3', 'A2', false]);
    expect(location.hash).toBe('#/print?person=I3&paper=A2&showFrame=false');
  });

  it('keeps the settings of the tree for #/print alone, and passes over someone not in the tree', () => {
    history.replaceState(null, '', '#/print');
    TestBed.inject(PrintRoute);
    store.load(updatePrint(sampleDocument(), { paper: 'A0' }));
    TestBed.tick();
    expect(store.doc().print?.paper).toBe('A0');
    expect(location.hash).toBe('#/print?person=I11&paper=A0');
  });

  it('tells which parameters two addresses differ in', () => {
    expect(changedKeys('#/print?person=I1&title=a', '#/print?person=I1&title=ab')).toBe('title');
    expect(changedKeys('#/print?person=I1', '#/print?person=I2&paper=A1')).toBe('paper,person');
  });
});
