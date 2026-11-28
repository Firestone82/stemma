import { TestBed } from '@angular/core/testing';
import { FileIo, PickedFile, ReadOutcome, SavedAs, SaveOutcome } from '../core/services/file-io';
import { DriveFile, DriveListing, DriveOutcome, GoogleDrive } from '../core/services/google-drive';
import { RecentFile, RecentFiles, RecentStorage } from '../core/services/recent-files';
import { TreeStore } from '../core/store/tree-store';
import { emptyDocument } from '../core/model/types';
import { serializeTree } from '../core/xml/serializer';
import { DocumentActions } from './document-actions';
import { UiState } from './ui-state';

/** Stand-ins for the browser's pickers and for Google Drive, recording what was written where. */
class FakeFiles {
  hosted = false;
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

class FakeDrive {
  configured = true;
  updated: DriveFile[] = [];
  created: string[] = [];
  picks = false;
  inDrive = new Map<string, { file: DriveFile; text: string }>();
  listed = 0;
  picked: { target: string; file: DriveFile | null }[] = [];
  toPick: DriveFile | null = null;
  createdIn: (DriveFile | undefined)[] = [];

  /** What the app showed of the reading as it went. */
  progressSeen: unknown[] = [];
  onProgress: () => unknown = () => undefined;

  async read(file: DriveFile, progress?: (loaded: number, total: number | null) => void): Promise<DriveOutcome<{ file: DriveFile; text: string }>> {
    const found = this.inDrive.get(file.id);
    if (found === undefined) return { status: 'missing' };
    progress?.(0, 200);
    this.progressSeen.push(this.onProgress());
    progress?.(100, 200);
    this.progressSeen.push(this.onProgress());
    return { status: 'done', value: found };
  }
  async pick(target: string): Promise<DriveOutcome<DriveFile>> {
    this.picked.push({ target, file: this.toPick });
    return this.toPick ? { status: 'done', value: this.toPick } : { status: 'declined' };
  }
  async list(): Promise<DriveOutcome<DriveListing[]>> {
    this.listed++;
    return { status: 'done', value: [...this.inDrive.values()].map(({ file }) => ({ ...file, modified: 0 })) };
  }
  async update(file: DriveFile): Promise<DriveOutcome<DriveFile>> {
    this.updated.push(file);
    return { status: 'done', value: file };
  }
  async create(name: string, _xml: string, folder?: DriveFile): Promise<DriveOutcome<DriveFile>> {
    this.created.push(name);
    this.createdIn.push(folder);
    return { status: 'done', value: { id: 'new-id', name } };
  }
  async details(): Promise<{ saved: number; folders: string[] } | null> {
    return { saved: 1234, folders: ['Family'] };
  }
}

/** Puts a file in the fake Drive, opens the Drive list and picks that file from it. */
async function openFromDrive(actions: DocumentActions, drive: FakeDrive, ui: UiState, file: DriveFile, text: string): Promise<void> {
  drive.inDrive.set(file.id, { file, text });
  await actions.openFromDrive();
  const dialog = ui.dialog();
  expect(dialog?.kind).toBe('drive-open');
  const listed = dialog?.kind === 'drive-open' ? dialog.files.find((f) => f.id === file.id) : undefined;
  expect(listed).toBeDefined();
  await actions.openDriveFile(listed!);
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
  let drive: FakeDrive;
  let ui: UiState;
  const xml = serializeTree(emptyDocument('Novák'));
  const handle = { name: 'novak.xml' } as FileSystemFileHandle;

  beforeEach(() => {
    files = new FakeFiles();
    drive = new FakeDrive();
    TestBed.configureTestingModule({
      providers: [
        { provide: FileIo, useValue: files },
        { provide: GoogleDrive, useValue: drive },
      ],
    });
    void TestBed.inject(RecentFiles).useStorage(memoryStorage());
    actions = TestBed.inject(DocumentActions);
    ui = TestBed.inject(UiState);
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

  it('writes back to the Google Drive file the tree was opened from', async () => {
    await openFromDrive(actions, drive, ui, { id: 'abc', name: 'novak.xml' }, xml);
    expect(actions.source()).toEqual({ kind: 'drive', file: { id: 'abc', name: 'novak.xml' } });

    await actions.saveXml();
    expect(drive.updated).toEqual([{ id: 'abc', name: 'novak.xml' }]);
    expect(files.savedAs).toEqual([]);
  });

  it('lists the trees in Google Drive, and opening one closes the list', async () => {
    await openFromDrive(actions, drive, ui, { id: 'abc', name: 'novak.xml' }, xml);
    expect(drive.listed).toBe(1);
    expect(ui.dialog()).toBeNull();
    expect(TestBed.inject(TreeStore).doc().meta.title).toBe('Novák');
  });

  it('opens a tree picked in the Google Picker, shared ones too, and writes back to it', async () => {
    drive.picks = true;
    const shared = { id: 'shared', name: 'from-cousin.xml' };
    drive.inDrive.set(shared.id, { file: shared, text: xml });
    drive.toPick = shared;
    await actions.openFromDrive();
    expect(drive.picked.map((p) => p.target)).toEqual(['file']);
    expect(drive.listed).toBe(0);
    expect(actions.source()).toEqual({ kind: 'drive', file: shared });
    await actions.saveXml();
    expect(drive.updated).toEqual([shared]);
  });

  it('saves a copy into the folder picked in the Google Picker, and nothing when none is picked', async () => {
    drive.picks = true;
    await actions.saveToDrive();
    expect(drive.created).toEqual([]);

    drive.toPick = { id: 'folder-1', name: 'Rodokmen' };
    await actions.saveToDrive();
    expect(drive.picked.map((p) => p.target)).toEqual(['folder', 'folder']);
    expect(drive.createdIn).toEqual([{ id: 'folder-1', name: 'Rodokmen' }]);
  });

  it('saves to the copy made in Google Drive from then on', async () => {
    await actions.saveToDrive();
    expect(drive.created).toHaveLength(1);
    await actions.saveXml();
    expect(drive.updated).toEqual([{ id: 'new-id', name: drive.created[0] }]);
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
  let drive: FakeDrive;
  let recent: RecentFiles;
  let store: TreeStore;
  let ui: UiState;
  const novak = serializeTree(emptyDocument('Novák'));
  const newer = serializeTree(emptyDocument('Novák, saved since'));
  const handle = fakeHandle('novak.xml');

  beforeEach(async () => {
    localStorage.clear();
    files = new FakeFiles();
    drive = new FakeDrive();
    TestBed.configureTestingModule({
      providers: [
        { provide: FileIo, useValue: files },
        { provide: GoogleDrive, useValue: drive },
      ],
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
    await openFromDrive(actions, drive, ui, { id: 'abc', name: 'drive.xml' }, serializeTree(emptyDocument('Dvořák')));
    await recent.settled();

    expect(recent.list().map((e) => [e.kind, e.name, e.title])).toEqual([
      ['drive', 'drive.xml', 'Dvořák'],
      ['local', 'novak.xml', 'Novák'],
    ]);
  });

  it('remembers when a local file was last saved, and when it is saved again', async () => {
    files.picked = { file: new File([novak], 'novak.xml', { lastModified: 1000 }), handle };
    await actions.openFile();
    await recent.settled();
    expect(recent.list()[0]).toMatchObject({ saved: 1000 });

    const before = Date.now();
    await actions.saveXml();
    await recent.settled();
    expect(recent.list()[0].saved).toBeGreaterThanOrEqual(before);
  });

  it('remembers a downloaded file as being in the downloads folder', async () => {
    await actions.saveXmlAs();
    await recent.settled();
    expect(recent.list()[0]).toMatchObject({ kind: 'local', downloaded: true });
  });

  it('adds when a Drive file was changed and its folders, as Drive says', async () => {
    await openFromDrive(actions, drive, ui, { id: 'abc', name: 'drive.xml' }, novak);
    await new Promise((resolve) => setTimeout(resolve));
    await recent.settled();
    expect(recent.list()[0]).toMatchObject({ kind: 'drive', saved: 1234, folders: ['Family'] });
  });

  it('shows how far along a tree from Drive is while it is read, and nothing once it is open', async () => {
    drive.onProgress = () => ui.driveLoading();
    await openFromDrive(actions, drive, ui, { id: 'abc', name: 'drive.xml' }, novak);
    expect(drive.progressSeen).toEqual([
      { name: 'drive.xml', loaded: 0, total: 200 },
      { name: 'drive.xml', loaded: 100, total: 200 },
    ]);
    expect(ui.driveLoading()).toBeNull();
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

  it('reads a recent Drive file afresh', async () => {
    await openFromDrive(actions, drive, ui, { id: 'abc', name: 'drive.xml' }, novak);
    await recent.settled();
    actions.startEmpty();

    drive.inDrive.set('abc', { file: { id: 'abc', name: 'drive.xml' }, text: newer });
    await actions.openRecent(recent.list()[0]);
    expect(store.doc().meta.title).toBe('Novák, saved since');
    expect(actions.source()).toEqual({ kind: 'drive', file: { id: 'abc', name: 'drive.xml' } });
  });

  it('explains how to set up Google Drive instead of opening it when no project is set up', async () => {
    drive.configured = false;
    await actions.openFromDrive();
    expect(ui.dialog()).toEqual({ kind: 'drive-setup' });
    expect(drive.listed).toBe(0);

    ui.dialog.set(null);
    await actions.saveToDrive();
    expect(ui.dialog()).toEqual({ kind: 'drive-setup' });
    expect(drive.created).toEqual([]);
  });

  it('offers the Drive items outside a viewer even before Drive is set up', () => {
    drive.configured = false;
    expect(actions.offersDrive()).toBe(true);
    expect(actions.driveReady()).toBe(false);
    files.hosted = true;
    expect(actions.offersDrive()).toBe(false);
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
