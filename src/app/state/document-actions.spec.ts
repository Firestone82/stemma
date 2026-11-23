import { TestBed } from '@angular/core/testing';
import { FileIo, PickedFile, ReadOutcome, SavedAs, SaveOutcome } from '../core/services/file-io';
import { RecentFile, RecentFiles, RecentStorage } from '../core/services/recent-files';
import { TreeStore } from '../core/store/tree-store';
import { emptyDocument } from '../core/model/types';
import { serializeTree } from '../core/xml/serializer';
import { DocumentActions } from './document-actions';
import { UiState } from './ui-state';

/** A stand-in for the browser's pickers, recording what was written where. */
class FakeFiles {
  picked: PickedFile | null = null;
  written: { handle: FileSystemFileHandle; data: Blob | string }[] = [];
  savedAs: string[] = [];
  saveAsResult: (name: string) => SavedAs = (name) => ({ outcome: 'saved', name });
  /** What reading a kept handle again gives, by the handle's name. */
  onDisk = new Map<string, ReadOutcome>();
  picks = 0;

  canSave(): boolean {
    return true;
  }
  async pickWithHandle(): Promise<PickedFile | null> {
    this.picks++;
    return this.picked;
  }
  async readHandle(handle: FileSystemFileHandle): Promise<ReadOutcome> {
    return this.onDisk.get(handle.name) ?? { status: 'missing' };
  }
  async writeTo(handle: FileSystemFileHandle, data: Blob | string): Promise<SaveOutcome> {
    this.written.push({ handle, data });
    return 'saved';
  }
  async saveAs(name: string): Promise<SavedAs> {
    this.savedAs.push(name);
    return this.saveAsResult(name);
  }
}

/** Keeps the recent files in memory instead of IndexedDB. */
function memoryStorage(initial: RecentFile[] = []): RecentStorage & { list: RecentFile[] } {
  return {
    list: initial,
    async read() {
      return this.list;
    },
    async write(list) {
      this.list = list;
    },
  };
}

/** A handle with a name that the fake pickers and readers tell apart by name. */
function fakeHandle(name: string): FileSystemFileHandle {
  return { name, kind: 'file', isSameEntry: async (other: FileSystemHandle) => other.name === name } as unknown as FileSystemFileHandle;
}

describe('DocumentActions saving', () => {
  let actions: DocumentActions;
  let files: FakeFiles;
  const xml = serializeTree(emptyDocument('Novák'));
  const handle = { name: 'novak.xml' } as FileSystemFileHandle;

  beforeEach(() => {
    files = new FakeFiles();
    TestBed.configureTestingModule({
      providers: [{ provide: FileIo, useValue: files }],
    });
    void TestBed.inject(RecentFiles).useStorage(memoryStorage());
    actions = TestBed.inject(DocumentActions);
    TestBed.inject(TreeStore).load(emptyDocument('Test'));
  });

  it('writes back to the local file the tree was opened from', async () => {
    files.picked = { file: new File([xml], 'novak.xml'), handle };
    await actions.openFile();
    expect(actions.source()).toEqual({ kind: 'local', handle, name: 'novak.xml' });

    await actions.saveXml();
    expect(files.written.map((w) => w.handle)).toEqual([handle]);
    expect(files.savedAs).toEqual([]);
  });

  it('saves a new file when the browser gave no handle for the opened one', async () => {
    files.picked = { file: new File([xml], 'novak.xml') };
    await actions.openFile();
    expect(actions.source()).toBeNull();

    await actions.saveXml();
    expect(files.written).toEqual([]);
    expect(files.savedAs).toHaveLength(1);
  });

  it('keeps writing to the file chosen in the save picker', async () => {
    files.saveAsResult = () => ({ outcome: 'saved', handle, name: 'chosen.xml' });
    await actions.saveXml();
    expect(actions.source()).toEqual({ kind: 'local', handle, name: 'chosen.xml' });

    await actions.saveXml();
    expect(files.savedAs).toHaveLength(1);
    expect(files.written.map((w) => w.handle)).toEqual([handle]);
  });

  it('Save as always asks again, even for a tree with a file', async () => {
    files.picked = { file: new File([xml], 'novak.xml'), handle };
    await actions.openFile();
    await actions.saveXmlAs();
    expect(files.savedAs).toHaveLength(1);
    expect(files.written).toEqual([]);
  });

  it('forgets the file for a new tree or the example family', async () => {
    files.picked = { file: new File([xml], 'novak.xml'), handle };
    await actions.openFile();
    actions.startEmpty();
    expect(actions.source()).toBeNull();

    await actions.openFile();
    actions.loadSample();
    expect(actions.source()).toBeNull();
  });

  it('does not take the file on when it cannot be opened', async () => {
    files.picked = { file: new File(['<not-a-tree/>'], 'other.xml'), handle };
    await actions.openFile();
    expect(actions.source()).toBeNull();
  });
});

describe('DocumentActions recent files and reopening', () => {
  let actions: DocumentActions;
  let files: FakeFiles;
  let recent: RecentFiles;
  let store: TreeStore;
  let ui: UiState;
  const novak = serializeTree(emptyDocument('Novák'));
  const newer = serializeTree(emptyDocument('Novák, saved since'));
  const handle = fakeHandle('novak.xml');

  beforeEach(async () => {
    localStorage.clear();
    files = new FakeFiles();
    TestBed.configureTestingModule({
      providers: [{ provide: FileIo, useValue: files }],
    });
    recent = TestBed.inject(RecentFiles);
    await recent.useStorage(memoryStorage());
    actions = TestBed.inject(DocumentActions);
    store = TestBed.inject(TreeStore);
    ui = TestBed.inject(UiState);
    store.load(emptyDocument('Test'));
  });

  afterEach(() => localStorage.clear());

  it('remembers an opened file with its title, newest first', async () => {
    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    files.picked = { file: new File([serializeTree(emptyDocument('Dvořák'))], 'dvorak.xml'), handle: fakeHandle('dvorak.xml') };
    await actions.openFile();
    await recent.settled();

    expect(recent.list().map((e) => [e.kind, e.name, e.title])).toEqual([
      ['local', 'dvorak.xml', 'Dvořák'],
      ['local', 'novak.xml', 'Novák'],
    ]);
  });

  it('keeps one entry for a file opened twice', async () => {
    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    files.picked = { file: new File([novak], 'novak.xml'), handle: fakeHandle('novak.xml') };
    await actions.openFile();
    await recent.settled();
    expect(recent.list()).toHaveLength(1);
  });

  it('reads a recent local file afresh, so what was saved since is what opens', async () => {
    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    await recent.settled();
    actions.startEmpty();

    files.onDisk.set('novak.xml', { status: 'done', file: new File([newer], 'novak.xml') });
    await actions.openRecent(recent.list()[0]);
    expect(store.doc().meta.title).toBe('Novák, saved since');
    expect(actions.source()).toEqual({ kind: 'local', handle, name: 'novak.xml' });
  });

  it('takes a recent file that is gone off the list', async () => {
    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    await recent.settled();
    actions.startEmpty();

    await actions.openRecent(recent.list()[0]);
    await recent.settled();
    expect(recent.list()).toEqual([]);
    expect(store.doc().people).toEqual([]);
  });

  it('opens the picker again for a recent file the browser kept no handle for', async () => {
    files.picked = { file: new File([novak], 'novak.xml') };
    await actions.openFile();
    await recent.settled();
    expect(recent.list()[0]).toMatchObject({ kind: 'local', name: 'novak.xml' });
    expect(files.picks).toBe(1);

    await actions.openRecent(recent.list()[0]);
    expect(files.picks).toBe(2);
  });

  it('keeps no browser copy of a tree from a file, so the next visit starts on the start page', async () => {
    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    actions.setTitle('Edited, not saved');
    actions.flush();
    expect(localStorage.getItem('stemma.tree.v1')).toBe('@file');

    // The next visit.
    store.load(emptyDocument('Before restore'));
    actions.restore();
    expect(store.doc().people).toEqual([]);
    expect(store.doc().meta.title).not.toBe('Edited, not saved');
    expect(ui.showSampleNote()).toBe(false);
    expect(actions.source()).toBeNull();
  });

  it('keeps a browser copy again for a new tree', async () => {
    actions.restore();
    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    actions.startEmpty();
    actions.setTitle('Started here');
    actions.flush();
    expect(localStorage.getItem('stemma.tree.v1')).toContain('Started here');
  });

  it('counts changes the file does not have as unsaved until they are saved', async () => {
    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    expect(actions.unsaved()).toBe(false);

    actions.setTitle('Changed');
    expect(actions.unsaved()).toBe(true);

    await actions.saveXml();
    expect(actions.unsaved()).toBe(false);
  });

  it('never counts a tree without a file as unsaved: the browser keeps it', () => {
    actions.setTitle('Changed');
    expect(actions.unsaved()).toBe(false);
  });

  it('asks before opening another file over unsaved changes', async () => {
    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    actions.setTitle('Changed');

    await actions.openFile();
    expect(files.picks).toBe(1);
    const dialog = ui.dialog();
    expect(dialog?.kind).toBe('unsaved');

    await actions.discardThen((dialog as { proceed: () => unknown }).proceed);
    expect(files.picks).toBe(2);
    expect(store.doc().meta.title).toBe('Novák');
  });

  it('saves first and then goes on, when asked to', async () => {
    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    actions.setTitle('Changed');
    await actions.openFile();
    const dialog = ui.dialog() as { proceed: () => unknown };

    await actions.saveThen(dialog.proceed);
    expect(files.written.map((w) => w.handle)).toEqual([handle]);
    expect(files.picks).toBe(2);
  });

  it('asks the browser to hold the page while changes are unsaved', async () => {
    const event = () => ({ preventDefault: vi.fn(), returnValue: undefined as unknown }) as unknown as BeforeUnloadEvent;
    const calm = event();
    actions.beforeUnload(calm);
    expect(calm.preventDefault).not.toHaveBeenCalled();

    files.picked = { file: new File([novak], 'novak.xml'), handle };
    await actions.openFile();
    actions.setTitle('Changed');
    const held = event();
    actions.beforeUnload(held);
    expect(held.preventDefault).toHaveBeenCalled();
  });
});
