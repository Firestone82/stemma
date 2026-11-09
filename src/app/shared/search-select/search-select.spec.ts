import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SearchOption, SearchSelect } from './search-select';

@Component({
  imports: [SearchSelect],
  template: `<stemma-search-select inputId="who" [options]="options" [value]="value()" (valueChange)="value.set($event)" />`,
})
class Host {
  readonly options: SearchOption[] = [
    { id: 'a', label: 'Anna Nováková', detail: '1950–2010' },
    { id: 'b', label: 'Bruno Novák' },
    { id: 'c', label: 'Čeněk Dvořák' },
  ];
  readonly value = signal('b');
}

describe('SearchSelect', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('stemma.prefs.v1', JSON.stringify({ language: 'en' }));
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  it('shows the chosen option, opens a list that narrows as one types, and chooses with the keyboard', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLButtonElement>('button#who')!;
    expect(button.textContent).toContain('Bruno Novák');
    expect(el.querySelector('.popover')).toBeNull();

    button.click();
    await fixture.whenStable();
    expect(el.querySelectorAll('li[role="option"]').length).toBe(3);
    const input = el.querySelector<HTMLInputElement>('input')!;
    // Diacritics do not matter when searching.
    input.value = 'cenek';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const options = el.querySelectorAll('li[role="option"]');
    expect(options.length).toBe(1);
    expect(options[0].textContent).toContain('Čeněk');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('c');
    expect(el.querySelector('.popover')).toBeNull();
    expect(button.textContent).toContain('Čeněk Dvořák');
  });

  it('closes with Escape without changing the choice', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('button#who')!.click();
    await fixture.whenStable();
    el.querySelector<HTMLInputElement>('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector('.popover')).toBeNull();
    expect(fixture.componentInstance.value()).toBe('b');
  });
});
