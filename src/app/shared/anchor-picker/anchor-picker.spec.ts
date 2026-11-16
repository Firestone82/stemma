import { TestBed } from '@angular/core/testing';
import { Anchor } from '../../core/model/types';
import { AnchorPicker } from './anchor-picker';

describe('AnchorPicker', () => {
  async function picker(inputs: Record<string, unknown> = {}) {
    localStorage.clear();
    localStorage.setItem('stemma.prefs.v1', JSON.stringify({ language: 'en' }));
    await TestBed.configureTestingModule({ imports: [AnchorPicker] }).compileComponents();
    const fixture = TestBed.createComponent(AnchorPicker);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    const picked: Anchor[] = [];
    fixture.componentInstance.valueChange.subscribe((a) => picked.push(a));
    await fixture.whenStable();
    const cells = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button[role="radio"]')];
    return { fixture, cells, picked };
  }

  it('offers the corners, the middles of the sides and the middle, the one picked marked, and says which was pressed', async () => {
    const { fixture, cells, picked } = await picker({ value: 'bottom-right' });
    expect(cells().map((c) => c.dataset['anchor'])).toEqual([
      'top-left',
      'top',
      'top-right',
      'left',
      'center',
      'right',
      'bottom-left',
      'bottom',
      'bottom-right',
    ]);
    expect(
      cells()
        .filter((c) => c.getAttribute('aria-checked') === 'true')
        .map((c) => c.dataset['anchor']),
    ).toEqual(['bottom-right']);
    expect(cells()[0].getAttribute('aria-label')).toBe('Top left');
    cells()[2].click();
    expect(picked).toEqual(['top-right']);
    // Nothing is marked for something that lies where it was put by hand.
    fixture.componentRef.setInput('value', null);
    await fixture.whenStable();
    expect(cells().some((c) => c.getAttribute('aria-checked') === 'true')).toBe(false);
  });

  it('offers only the top row for a title, and nothing while switched off', async () => {
    const { fixture, cells, picked } = await picker({ topOnly: true, value: 'top' });
    expect(cells().map((c) => c.dataset['anchor'])).toEqual(['top-left', 'top', 'top-right']);
    fixture.componentRef.setInput('disabled', true);
    await fixture.whenStable();
    cells()[0].click();
    expect(picked).toEqual([]);
  });
});
