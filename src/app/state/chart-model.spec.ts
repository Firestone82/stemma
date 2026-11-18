import { TestBed } from '@angular/core/testing';
import { sampleDocument } from '../core/model/sample';
import { updateMeta, updateView } from '../core/model/operations';
import { TreeStore } from '../core/store/tree-store';
import { ChartModel } from './chart-model';

describe('the chart', () => {
  let store: TreeStore;
  let model: ChartModel;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('stemma.prefs.v1', JSON.stringify({ language: 'en' }));
    store = TestBed.inject(TreeStore);
    model = TestBed.inject(ChartModel);
    store.load(sampleDocument());
  });

  it('stays as it is when the tree is centred on someone else, and only says how everyone is related to them', () => {
    const before = model.layout();
    const places = (l: typeof before) => l.cards.map((c) => `${c.key}@${c.x},${c.y}`).sort();
    // Simon is in the middle: Thomas is his grandfather, Edith his grandmother.
    expect(model.labels().get('I1')!.kin).toBe('Grandfather');
    expect(model.labels().get('I11')!.kin).toBe('');
    store.update((doc) => updateMeta(doc, { homePersonId: 'I1' }));
    expect(model.focusId()).toBe('I1');
    expect(model.layout()).toBe(before);
    expect(places(model.layout())).toEqual(places(before));
    expect(model.labels().get('I11')!.kin).toBe('Grandson');
    expect(model.labels().get('I1')!.kin).toBe('');
  });

  it('puts the relationship names on the cards only while the setting is on', () => {
    const tall = model.design().height;
    store.update((doc) => updateView(doc, { showRelationships: false }));
    expect(model.parts().kin).toBe(false);
    expect(model.labels().get('I1')!.kin).toBe('');
    // A line less on every card, and still in the tooltip.
    expect(model.design().height).toBeLessThan(tall);
    expect(model.labels().get('I1')!.title).toContain('Grandfather');
  });
});
