import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { TreeStore } from './core/store/tree-store';
import { I18n } from './i18n/i18n';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('stemma.prefs.v1', JSON.stringify({ language: 'en' }));
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('opens with the example family drawn on the chart', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('g.card').length).toBe(29);
    expect(el.querySelector('stemma-sample-note')?.textContent).toContain('example family');
    expect(el.querySelector('stemma-overview-panel input#tree-title')).toBeTruthy();
  });

  it('shows a person in the panel when selected', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    TestBed.inject(TreeStore).selectPerson('I11');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('stemma-person-panel h2')?.textContent).toContain('Simon Ashworth');
    expect((el.querySelector('#person-given') as HTMLInputElement).value).toBe('Simon');
  });

  it('opens a menu of actions on a right click on a person', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const card = el.querySelector<SVGGElement>('g.card[data-person="I11"]')!;
    card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 }));
    await fixture.whenStable();
    const menu = el.querySelector('stemma-context-menu')!;
    expect(menu).toBeTruthy();
    expect(menu.querySelector('.menu-title')?.textContent).toContain('Simon Ashworth');
    const labels = [...menu.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toContain('Add a child');
    expect(labels).toContain('Delete person');
    // The person is selected as the menu opens; Delete asks before anything happens.
    expect(TestBed.inject(TreeStore).selection()).toEqual({ kind: 'person', id: 'I11' });
    // The test browser has no modal dialogs; opening one is enough here.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    [...menu.querySelectorAll('button')].find((b) => b.textContent?.includes('Delete person'))!.click();
    await fixture.whenStable();
    expect(el.querySelector('stemma-context-menu')).toBeNull();
    expect(el.querySelector('stemma-confirm-delete')).toBeTruthy();
  });

  it('keeps a copy of the tree in the browser', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const store = TestBed.inject(TreeStore);
    store.selectPerson('I11');
    store.update((doc) => ({ ...doc, meta: { ...doc.meta, title: 'Renamed' } }));
    await new Promise((r) => setTimeout(r, 700));
    expect(localStorage.getItem('stemma.tree.v1')).toContain('<title>Renamed</title>');
  });

  it('notes how every couple on the chart stands', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const notes = [...el.querySelectorAll('stemma-chart text.label')].map((t) => t.textContent?.trim());
    expect(notes).toContain('married');
    expect(notes).toContain('divorced');
    expect(notes).toContain('engaged');
  });

  it('speaks the language chosen for the app, on the chart too', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    TestBed.inject(I18n).setLanguage('cs');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('stemma-sample-note')?.textContent).toContain('ukázková rodina');
    expect(document.documentElement.lang).toBe('cs');
    // The example tree was saved with English words on the chart; the chart follows the app.
    const kin = [...el.querySelectorAll('stemma-chart text.kin')].map((t) => t.textContent?.trim());
    expect(kin).toContain('Otec');
    expect([...el.querySelectorAll('stemma-chart text.label')].map((t) => t.textContent?.trim())).toContain('manželé');
  });
});
