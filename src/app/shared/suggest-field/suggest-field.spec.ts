import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SuggestField, Suggestion } from './suggest-field';

@Component({
  imports: [SuggestField],
  template: `<stemma-suggest-field
    inputId="surname"
    [value]="text()"
    [suggestions]="suggestions"
    [current]="current()"
    (textChange)="text.set($event)"
    (pick)="picked.set($event)"
  />`,
})
class Host {
  readonly suggestions: Suggestion[] = [
    { id: 'F1', label: 'Nováková', detail: 'Karel Novák' },
    { id: 'F2', label: 'Mikulová', detail: 'Pavel Mikula' },
  ];
  readonly text = signal('');
  readonly current = signal('F2');
  readonly picked = signal('');
}

describe('SuggestField', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('stemma.prefs.v1', JSON.stringify({ language: 'en' }));
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  async function setup() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input#surname')!;
    return {
      el,
      host: fixture.componentInstance,
      stable: () => fixture.whenStable(),
      type: async (text: string) => {
        input.value = text;
        input.dispatchEvent(new Event('input'));
        await fixture.whenStable();
      },
      key: async (key: string) => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        await fixture.whenStable();
      },
      shown: () => [...el.querySelectorAll('li[role="option"] .label')].map((l) => l.textContent!.trim()),
    };
  }

  it('suggests what matches what is typed, and keeps what is typed when nothing is taken', async () => {
    const { el, host, type, key, shown } = await setup();
    expect(shown()).toEqual([]);
    // Neither case nor diacritics matter.
    await type('nova');
    expect(shown()).toEqual(['Nováková']);
    expect(host.text()).toBe('nova');
    // Enter with no suggestion reached keeps the text.
    await key('Enter');
    expect(el.querySelector('.list')).toBeNull();
    expect(host.picked()).toBe('');
    // Nothing matches: no list over the name written in.
    await type('Dvořáková');
    expect(shown()).toEqual([]);
    expect(host.text()).toBe('Dvořáková');
  });

  it('shows every suggestion from the arrow, the current one marked, and takes one with the keyboard or a click', async () => {
    const { el, host, stable, type, key, shown } = await setup();
    el.querySelector<HTMLButtonElement>('button.arrow')!.click();
    await stable();
    expect(shown()).toEqual(['Nováková', 'Mikulová']);
    expect(el.querySelector('li.chosen')!.textContent).toContain('Mikulová');
    await key('ArrowUp');
    await key('Enter');
    expect(host.picked()).toBe('F1');
    expect(el.querySelector('.list')).toBeNull();
    // The down arrow in the field shows them all too; a click takes one.
    await key('ArrowDown');
    expect(shown()).toHaveLength(2);
    el.querySelectorAll<HTMLElement>('li[role="option"]')[1].click();
    await stable();
    expect(host.picked()).toBe('F2');
    // Escape closes the list and takes nothing.
    host.picked.set('');
    await type('mik');
    expect(shown()).toEqual(['Mikulová']);
    await key('Escape');
    expect(el.querySelector('.list')).toBeNull();
    expect(host.picked()).toBe('');
  });
});
