import { Injectable, effect, inject, untracked } from '@angular/core';
import { updateView } from '../core/model/operations';
import { ToastService } from '../core/services/toast';
import { TreeStore } from '../core/store/tree-store';
import { serializeTree } from '../core/xml/serializer';
import { I18n } from '../i18n/i18n';
import { AUTOSAVE_STORE, idbRun } from '../core/services/browser-db';

const TREE_KEY = 'stemma.tree.v1';
/** Left in localStorage when the tree is too big for it (a large background picture) and went to IndexedDB. */
const IN_DATABASE = '@indexeddb';
/** Left in localStorage when the last tree came from a file: the file is its copy, so nothing is reopened. */
const CLOSED = '@file';

/**
 * Keeps a copy of the open tree in this browser, as the same XML the app
 * saves to files. Browser storage can be cleared at any time, so the XML file
 * is the real copy; this only spares people from losing work on a reload.
 *
 * The copy goes to localStorage, which is read at once on start. A tree that
 * does not fit there (a background picture can be several megabytes) goes to
 * IndexedDB instead, which holds much more but is read asynchronously.
 *
 * A tree opened from or saved to a file (on the computer or in Google Drive) is not kept: that file is its copy, and
 * reopening a browser copy of it on the next visit could mean editing an older version than the file holds. For such
 * a tree only a marker is left (`CLOSED`), and the next visit starts on the start page with the recent files.
 */
@Injectable({ providedIn: 'root' })
export class Autosave {
  private readonly store = inject(TreeStore);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18n);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private warned = false;
  private enabled = false;
  /**
   * `keep` while copies are kept; `file` while the open tree belongs to a file (see `setFileBacked`); `aside` while it
   * came from a shared link (see `setAside`).
   */
  private mode: 'keep' | 'file' | 'aside' = 'keep';

  private get keep(): boolean {
    return this.mode === 'keep';
  }

  constructor() {
    effect(() => {
      this.store.revision();
      if (!untracked(() => this.enabled)) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.write(), 500);
    });
  }

  /** Starts saving after the first tree has been loaded. */
  enable(): void {
    this.enabled = true;
  }

  /**
   * The saved tree: at once when it is in localStorage, later when it is in IndexedDB; `closed` when the last tree
   * came from a file, so there is nothing to reopen.
   */
  read(): string | 'closed' | Promise<string | null> | null {
    let saved: string | null;
    try {
      saved = localStorage.getItem(TREE_KEY);
    } catch {
      return null;
    }
    if (saved === CLOSED) return 'closed';
    return saved === IN_DATABASE ? idbGet().catch(() => null) : saved;
  }

  /**
   * Says whether the open tree belongs to a file. While it does, no copy is kept in the browser and the one there is
   * replaced by the marker; once it does not (a new tree, the example family), copies are kept again.
   */
  setFileBacked(fileBacked: boolean): void {
    this.setMode(fileBacked ? 'file' : 'keep');
  }

  /**
   * The open tree came from someone else's link (a tree shared in Google Drive): it is not kept in the browser, and
   * the copy already there (this person's own tree) is left as it is, to come back to when they close the shared one.
   */
  setAside(): void {
    this.setMode('aside');
  }

  private setMode(mode: 'keep' | 'file' | 'aside'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    clearTimeout(this.timer);
    if (mode === 'file') {
      try {
        localStorage.setItem(TREE_KEY, CLOSED);
      } catch {
        // Nothing to replace where storage is blocked.
      }
      void idbDelete().catch(() => undefined);
    } else if (mode === 'keep' && this.enabled) {
      this.write();
    }
  }

  flush(): void {
    if (!this.enabled || !this.keep) return;
    clearTimeout(this.timer);
    this.write();
  }

  private write(): void {
    if (!this.keep) return;
    // As DocumentActions.xml(): with the language the chart is in.
    const xml = serializeTree(updateView(this.store.doc(), { language: this.i18n.code() }));
    try {
      localStorage.setItem(TREE_KEY, xml);
      void idbDelete().catch(() => undefined);
      return;
    } catch {
      // Too big for localStorage (or it is blocked): try IndexedDB.
    }
    idbPut(xml)
      .then(() => {
        try {
          localStorage.setItem(TREE_KEY, IN_DATABASE);
        } catch {
          // Without the marker the copy is not found again; the warning below covers it.
          throw new Error('marker');
        }
      })
      .catch(() => this.warn());
  }

  private warn(): void {
    if (this.warned) return;
    this.warned = true;
    this.toast.error(this.i18n.t('file.autosaveFailed'));
  }
}

const idbGet = () => idbRun<string | undefined>(AUTOSAVE_STORE, 'readonly', (s) => s.get('tree')).then((v) => v ?? null);
const idbPut = (xml: string) => idbRun(AUTOSAVE_STORE, 'readwrite', (s) => s.put(xml, 'tree')).then(() => undefined);
const idbDelete = () => idbRun(AUTOSAVE_STORE, 'readwrite', (s) => s.delete('tree')).then(() => undefined);
