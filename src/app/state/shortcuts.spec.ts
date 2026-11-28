import { TestBed } from '@angular/core/testing';
import { DocumentActions } from './document-actions';
import { Shortcuts } from './shortcuts';

describe('Shortcuts: Ctrl+C', () => {
  let shortcuts: Shortcuts;
  let closeTree: ReturnType<typeof vi.fn>;
  let fileBacked: boolean;

  beforeEach(() => {
    fileBacked = true;
    closeTree = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: DocumentActions, useValue: { fileBacked: () => fileBacked, closeTree } }],
    });
    shortcuts = TestBed.inject(Shortcuts);
  });

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  function press(target: Element = document.body): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: target });
    shortcuts.handle(e);
    return e;
  }

  it('closes a tree from a file', () => {
    const e = press();
    expect(closeTree).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(true);
  });

  it('copies instead while text is selected', () => {
    const p = document.createElement('p');
    p.textContent = 'Jan Novák';
    document.body.append(p);
    document.getSelection()?.selectAllChildren(p);
    const e = press();
    expect(closeTree).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('copies instead in a field', () => {
    const input = document.createElement('input');
    document.body.append(input);
    press(input);
    expect(closeTree).not.toHaveBeenCalled();
  });

  it('does nothing for a tree without a file, which has no Close', () => {
    fileBacked = false;
    press();
    expect(closeTree).not.toHaveBeenCalled();
  });
});
