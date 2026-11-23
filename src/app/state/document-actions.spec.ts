import { TestBed } from '@angular/core/testing';
import { FileIo, PickedFile, SavedAs, SaveOutcome } from '../core/services/file-io';
import { DriveFile, DriveOutcome, GoogleDrive } from '../core/services/google-drive';
import { TreeStore } from '../core/store/tree-store';
import { emptyDocument } from '../core/model/types';
import { serializeTree } from '../core/xml/serializer';
import { DocumentActions } from './document-actions';

/** Stand-ins for the browser's pickers and for Google Drive, recording what was written where. */
class FakeFiles {
  hosted = false;
  picked: PickedFile | null = null;
  written: { handle: FileSystemFileHandle; data: Blob | string }[] = [];
  savedAs: string[] = [];
  saveAsResult: (name: string) => SavedAs = (name) => ({ outcome: 'saved', name });

  canSave(): boolean {
    return true;
  }
  async pickWithHandle(): Promise<PickedFile | null> {
    return this.picked;
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
  opened: { file: DriveFile; text: string } | null = null;

  async open(): Promise<DriveOutcome<{ file: DriveFile; text: string }>> {
    return this.opened ? { status: 'done', value: this.opened } : { status: 'declined' };
  }
  async update(file: DriveFile): Promise<DriveOutcome<DriveFile>> {
    this.updated.push(file);
    return { status: 'done', value: file };
  }
  async create(name: string): Promise<DriveOutcome<DriveFile>> {
    this.created.push(name);
    return { status: 'done', value: { id: 'new-id', name } };
  }
}

describe('DocumentActions saving', () => {
  let actions: DocumentActions;
  let files: FakeFiles;
  let drive: FakeDrive;
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

  it('writes back to the Google Drive file the tree was opened from', async () => {
    drive.opened = { file: { id: 'abc', name: 'novak.xml' }, text: xml };
    await actions.openFromDrive();
    expect(actions.source()).toEqual({ kind: 'drive', file: { id: 'abc', name: 'novak.xml' } });

    await actions.saveXml();
    expect(drive.updated).toEqual([{ id: 'abc', name: 'novak.xml' }]);
    expect(files.savedAs).toEqual([]);
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
