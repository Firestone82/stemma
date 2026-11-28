import { TestBed } from '@angular/core/testing';
import { RECENT_LIMIT, RecentFile, RecentFiles, RecentStorage } from './recent-files';

function memoryStorage(initial: unknown = []): RecentStorage & { list: RecentFile[] } {
  return {
    list: initial as RecentFile[],
    async read() {
      return this.list;
    },
    async write(list) {
      this.list = list;
    },
  };
}

function handle(name: string, id = name): FileSystemFileHandle {
  return { name, id, isSameEntry: async (other: { id?: string }) => other.id === id } as unknown as FileSystemFileHandle;
}

describe('RecentFiles', () => {
  let recent: RecentFiles;
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(async () => {
    recent = TestBed.inject(RecentFiles);
    storage = memoryStorage();
    await recent.useStorage(storage);
  });

  it('lists files newest first and keeps the list', async () => {
    await recent.remember({ kind: 'local', name: 'a.xml', title: 'A', handle: handle('a.xml') }, 1);
    await recent.remember({ kind: 'drive', title: 'B', file: { id: 'b', name: 'b.xml' } }, 2);
    expect(recent.list().map((e) => e.name)).toEqual(['b.xml', 'a.xml']);
    expect(storage.list.map((e) => e.name)).toEqual(['b.xml', 'a.xml']);
  });

  it('moves a file opened again to the top, under its new title', async () => {
    await recent.remember({ kind: 'local', name: 'a.xml', title: 'A', handle: handle('a.xml', 'h1') }, 1);
    await recent.remember({ kind: 'drive', title: 'B', file: { id: 'b', name: 'b.xml' } }, 2);
    await recent.remember({ kind: 'local', name: 'a.xml', title: 'A renamed', handle: handle('a.xml', 'h1') }, 3);
    expect(recent.list().map((e) => [e.name, e.title, e.at])).toEqual([
      ['a.xml', 'A renamed', 3],
      ['b.xml', 'B', 2],
    ]);
  });

  it('tells two files of the same name apart by their handles', async () => {
    await recent.remember({ kind: 'local', name: 'tree.xml', title: 'One', handle: handle('tree.xml', 'h1') });
    await recent.remember({ kind: 'local', name: 'tree.xml', title: 'Two', handle: handle('tree.xml', 'h2') });
    expect(recent.list()).toHaveLength(2);
  });

  it('tells files without handles apart by name', async () => {
    await recent.remember({ kind: 'local', name: 'tree.xml', title: 'One' });
    await recent.remember({ kind: 'local', name: 'tree.xml', title: 'Again' });
    expect(recent.list().map((e) => e.title)).toEqual(['Again']);
  });

  it(`keeps the newest ${RECENT_LIMIT}`, async () => {
    for (let i = 0; i < RECENT_LIMIT + 3; i++) await recent.remember({ kind: 'drive', title: `T${i}`, file: { id: `f${i}`, name: `f${i}.xml` } }, i);
    expect(recent.list()).toHaveLength(RECENT_LIMIT);
    expect(recent.list()[0].name).toBe(`f${RECENT_LIMIT + 2}.xml`);
  });

  it('keeps when a file was saved and whether it was downloaded', async () => {
    await recent.remember({ kind: 'local', name: 'a.xml', title: 'A', saved: 5, downloaded: true }, 6);
    expect(recent.list()[0]).toMatchObject({ saved: 5, downloaded: true, at: 6 });
  });

  it('adds what Drive says of a file without moving it', async () => {
    await recent.remember({ kind: 'drive', title: 'B', file: { id: 'b', name: 'b.xml' } }, 1);
    await recent.remember({ kind: 'local', name: 'a.xml', title: 'A' }, 2);
    await recent.describeDrive('b', { saved: 9, folders: ['Family', 'Trees'] });
    expect(recent.list().map((e) => e.name)).toEqual(['a.xml', 'b.xml']);
    expect(recent.list()[1]).toMatchObject({ saved: 9, folders: ['Family', 'Trees'] });
  });

  it('keeps the folders of a Drive file opened again until Drive is asked', async () => {
    await recent.remember({ kind: 'drive', title: 'B', file: { id: 'b', name: 'b.xml' }, saved: 3, top: 'shared', folders: ['Family'] }, 1);
    await recent.remember({ kind: 'drive', title: 'B', file: { id: 'b', name: 'b.xml' } }, 4);
    expect(recent.list()[0]).toMatchObject({ saved: 3, top: 'shared', folders: ['Family'], at: 4 });
  });

  it('forgets a file', async () => {
    await recent.remember({ kind: 'drive', title: 'B', file: { id: 'b', name: 'b.xml' } });
    await recent.forget(recent.list()[0].key);
    expect(recent.list()).toEqual([]);
    expect(storage.list).toEqual([]);
  });

  it('drops entries it cannot open', async () => {
    await recent.useStorage(
      memoryStorage([{ kind: 'drive', key: 'x', name: 'x.xml', title: '', at: 0 }, 'junk', { kind: 'local', key: 'l', name: 'l.xml', title: '', at: 0 }]),
    );
    expect(recent.list().map((e) => e.key)).toEqual(['l']);
  });

  it('starts with an empty list when the storage cannot be read', async () => {
    await recent.useStorage({ read: () => Promise.reject(new Error('blocked')), write: async () => undefined });
    expect(recent.list()).toEqual([]);
  });
});
