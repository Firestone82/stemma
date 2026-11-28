import { Injectable, signal } from '@angular/core';
import { RECENT_STORE, idbRun } from './browser-db';
import { DriveFile } from './google-drive';

/**
 * A tree opened or saved lately: a file on the computer, kept with the browser's handle to it where the browser gives
 * one (Chrome, Edge), or a file in Google Drive. Only what is needed to find the file again is kept, never the tree.
 */
export type RecentFile =
  | ({ kind: 'local'; key: string; name: string; title: string; at: number; handle?: FileSystemFileHandle } & LocalDetails)
  | ({ kind: 'drive'; key: string; name: string; title: string; at: number; file: DriveFile } & DriveDetails);

/**
 * What is known of a file on the computer: when it was last saved, and whether it was downloaded (so it is in the
 * downloads folder). Browsers never tell a web page the folder a picked file is in.
 */
export interface LocalDetails {
  saved?: number;
  downloaded?: boolean;
}

/**
 * What Drive says of a file: when it was last changed, whether it is in the person's own Drive, was shared with them
 * by someone else, or is in a shared drive, and the folders it is in from the top down ("…" first where the folders
 * above could not be read).
 */
export interface DriveDetails {
  saved?: number;
  top?: 'mine' | 'shared' | 'shared-drive';
  folders?: string[];
}

/** What to remember about a file just opened or saved; the key and the time are filled in. */
export type RecentFileInput =
  | ({ kind: 'local'; name: string; title: string; handle?: FileSystemFileHandle } & LocalDetails)
  | ({ kind: 'drive'; title: string; file: DriveFile } & DriveDetails);

/** The key of a Drive file in the list. */
export function driveKey(id: string): string {
  return `drive:${id}`;
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
 * The files opened and saved lately, newest first, for the start page and the File menu. Kept in IndexedDB, because
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

  /** Adds what Drive said of a file on the list (learnt after it was opened or saved), leaving the order as it is. */
  describeDrive(id: string, details: DriveDetails): Promise<void> {
    const key = driveKey(id);
    return this.change(async (list) => list.map((e) => (e.key === key && e.kind === 'drive' ? { ...e, ...details } : e)));
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
    if (input.kind === 'drive') {
      const key = driveKey(input.file.id);
      // Until Drive has been asked again, the file is taken to be where it was and as old as it was.
      const before = list.find((e): e is Extract<RecentFile, { kind: 'drive' }> => e.key === key && e.kind === 'drive');
      const saved = input.saved ?? before?.saved;
      const folders = input.folders ?? before?.folders;
      const top = input.top ?? before?.top;
      return {
        kind: 'drive',
        key,
        name: input.file.name,
        title: input.title,
        at,
        file: { id: input.file.id, name: input.file.name },
        ...(saved !== undefined ? { saved } : {}),
        ...(folders ? { folders } : {}),
        ...(top ? { top } : {}),
      };
    }
    const same = await sameLocalFile(input, list);
    const key = same?.key ?? `local:${input.handle ? crypto.randomUUID() : input.name}`;
    return {
      kind: 'local',
      key,
      name: input.name,
      title: input.title,
      at,
      ...(input.handle ? { handle: input.handle } : {}),
      ...(input.saved !== undefined ? { saved: input.saved } : {}),
      ...(input.downloaded ? { downloaded: true } : {}),
    };
  }
}

/** An entry for the same file on the computer: the browser tells by the handles; without handles, by the name. */
async function sameLocalFile(input: Extract<RecentFileInput, { kind: 'local' }>, list: readonly RecentFile[]): Promise<RecentFile | undefined> {
  for (const e of list) {
    if (e.kind !== 'local') continue;
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

/** Drops entries a different version of the app might have left that this one cannot open. */
function sanitize(list: unknown): RecentFile[] {
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is RecentFile =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as RecentFile).key === 'string' &&
      typeof (e as RecentFile).name === 'string' &&
      ((e as RecentFile).kind === 'local' || ((e as RecentFile).kind === 'drive' && typeof (e as { file?: DriveFile }).file?.id === 'string')),
  );
}
