import { Injectable, signal } from '@angular/core';
import { RECENT_STORE, idbRun } from './browser-db';

/**
 * A tree opened or saved lately: a file on the computer, kept with the browser's handle to it where the browser gives
 * one (Chrome, Edge). Only what is needed to find the file again is kept, never the tree.
 */
export interface RecentFile {
  kind: 'local';
  key: string;
  name: string;
  title: string;
  at: number;
  handle?: FileSystemFileHandle;
}

/** What to remember about a file just opened or saved; the key and the time are filled in. */
export interface RecentFileInput {
  kind: 'local';
  name: string;
  title: string;
  handle?: FileSystemFileHandle;
}

/** How many files the list keeps. */
export const RECENT_LIMIT = 8;
const LIST_KEY = 'list';

/** Where the list is kept. IndexedDB in the app; a stand-in in tests. */
export interface RecentStorage {
  read(): Promise<RecentFile[]>;
  write(list: RecentFile[]): Promise<void>;
}

const indexedDbStorage: RecentStorage = {
  read: () => idbRun<RecentFile[] | undefined>(RECENT_STORE, 'readonly', (s) => s.get(LIST_KEY)).then((v) => v ?? []),
  write: (list) => idbRun(RECENT_STORE, 'readwrite', (s) => s.put(list, LIST_KEY)).then(() => undefined),
};

/**
 * The files opened and saved lately, newest first, for the start page. Kept in IndexedDB, because
 * the browser's file handles can be kept there (not in localStorage). Opening one of them again reads the file afresh.
 */
@Injectable({ providedIn: 'root' })
export class RecentFiles {
  private storage: RecentStorage = indexedDbStorage;
  private readonly _list = signal<readonly RecentFile[]>([]);
  readonly list = this._list.asReadonly();
  private loaded: Promise<void>;
  /** Changes to the list are made one after another, so two quick ones do not overwrite each other. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    this.loaded = this.load();
  }

  /** For tests: keeps the list somewhere else and reads it from there. */
  useStorage(storage: RecentStorage): Promise<void> {
    this.storage = storage;
    this.loaded = this.load();
    return this.loaded;
  }

  /** Waits for the list to be read and for the changes asked for so far to be made. */
  async settled(): Promise<void> {
    await this.loaded;
    await this.queue;
  }

  /** Puts a file at the top of the list, replacing an older entry for the same file. */
  remember(input: RecentFileInput, at = Date.now()): Promise<void> {
    return this.change(async (list) => {
      const entry = await this.entry(input, list, at);
      return [entry, ...list.filter((e) => e.key !== entry.key)].slice(0, RECENT_LIMIT);
    });
  }

  /** Takes a file off the list. */
  forget(key: string): Promise<void> {
    return this.change(async (list) => list.filter((e) => e.key !== key));
  }

  private async load(): Promise<void> {
    try {
      this._list.set(sanitize(await this.storage.read()));
    } catch {
      this._list.set([]);
    }
  }

  private change(edit: (list: readonly RecentFile[]) => Promise<RecentFile[]>): Promise<void> {
    const next = this.queue.then(async () => {
      await this.loaded;
      const list = await edit(this._list());
      this._list.set(list);
      try {
        await this.storage.write(list);
      } catch {
        // The list lives on for this visit; it is only a convenience.
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The entry for a file, with the key of an older entry for the same file so it replaces that one. */
  private async entry(input: RecentFileInput, list: readonly RecentFile[], at: number): Promise<RecentFile> {
    const same = await sameLocalFile(input, list);
    const key = same?.key ?? `local:${input.handle ? crypto.randomUUID() : input.name}`;
    return { kind: 'local', key, name: input.name, title: input.title, at, ...(input.handle ? { handle: input.handle } : {}) };
  }
}

/** An entry for the same file on the computer: the browser tells by the handles; without handles, by the name. */
async function sameLocalFile(input: RecentFileInput, list: readonly RecentFile[]): Promise<RecentFile | undefined> {
  for (const e of list) {
    if (input.handle && e.handle) {
      try {
        if (await input.handle.isSameEntry(e.handle)) return e;
      } catch {
        // A handle that cannot be compared is not the same file.
      }
    } else if (!input.handle && !e.handle && e.name === input.name) {
      return e;
    }
  }
  return undefined;
}

/** Drops entries a different version of the app might have left that this one cannot open (such as Google Drive files). */
function sanitize(list: unknown): RecentFile[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is RecentFile =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as RecentFile).key === 'string' &&
      typeof (e as RecentFile).name === 'string' &&
      (e as RecentFile).kind === 'local',
  );
}
