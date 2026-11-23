import { Injectable } from '@angular/core';

/** The part of the Claude artifact viewer's `downloads` capability this app uses. */
interface DownloadsApi {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}

interface ClaudeHost {
  use(name: 'downloads'): Promise<DownloadsApi | null>;
}

export type SaveOutcome = 'saved' | 'declined' | 'unsupported' | 'failed';

/** A file type offered by the browser's own open and save pickers. */
export interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

/** The parts of the File System Access API used here (Chrome and Edge; not yet in TypeScript's DOM types). */
interface FileAccessWindow {
  showOpenFilePicker?(options: { types?: PickerType[]; excludeAcceptAllOption?: boolean; multiple?: false }): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(options: { suggestedName?: string; types?: PickerType[] }): Promise<FileSystemFileHandle>;
}

interface PermissionedHandle {
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

/** How reading a file again from a kept handle ended: `missing` when it was moved or deleted. */
export type ReadOutcome = { status: 'done'; file: File } | { status: 'declined' } | { status: 'missing' } | { status: 'failed' };

/** A file picked from the computer, with the handle to write it back where the browser gives one. */
export interface PickedFile {
  file: File;
  handle?: FileSystemFileHandle;
}

/** A file saved through the browser's save picker, which can be written again in place. */
export interface SavedAs {
  outcome: SaveOutcome;
  handle?: FileSystemFileHandle;
  name: string;
}

/** File types the artifact viewer lets a page save (see its downloads capability). */
const HOSTED_EXTENSIONS = new Set(['gif', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'json', 'md', 'csv', 'html', 'svg', 'pdf', 'zip']);

/**
 * Opening and saving files. In a normal browser this is a file picker and a
 * download link. When the app runs as a published Claude artifact, downloads
 * go through the viewer, which asks the person to confirm and only accepts
 * some file types (not .xml).
 */
@Injectable({ providedIn: 'root' })
export class FileIo {
  private readonly host: ClaudeHost | undefined = typeof window !== 'undefined' ? (window as unknown as { claude?: ClaudeHost }).claude : undefined;
  private readonly downloads: Promise<DownloadsApi | null> | undefined;

  constructor() {
    if (this.host?.use) {
      this.downloads = this.host.use('downloads').catch(() => null);
    }
  }

  /** True when running inside a viewer that controls downloads. */
  get hosted(): boolean {
    return !!this.host?.use;
  }

  canSave(filename: string): boolean {
    if (!this.hosted) return true;
    return HOSTED_EXTENSIONS.has(filename.split('.').pop()?.toLowerCase() ?? '');
  }

  async save(filename: string, data: Blob | string, mime: string): Promise<SaveOutcome> {
    if (this.hosted) {
      const api = await this.downloads;
      if (!api) return 'unsupported';
      try {
        await api.save({ filename, data });
        return 'saved';
      } catch (e) {
        const code = (e as { code?: string } | null)?.code;
        if (code === 'declined') return 'declined';
        if (code === 'rejected_extension' || code === 'extension_not_enabled' || code === 'unavailable' || code === 'not_granted') return 'unsupported';
        return 'failed';
      }
    }
    try {
      const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return 'saved';
    } catch {
      return 'failed';
    }
  }

  /**
   * True when files can be opened with a handle and written back in place (the File System Access API). Not inside
   * a viewer, which runs the page in a frame where the browser's pickers are not allowed.
   */
  get canWriteInPlace(): boolean {
    if (this.hosted || typeof window === 'undefined' || window.self !== window.top) return false;
    const w = window as unknown as FileAccessWindow;
    return typeof w.showOpenFilePicker === 'function' && typeof w.showSaveFilePicker === 'function';
  }

  /**
   * Shows the browser's open picker for one file of the given type, keeping its handle so it can be saved in
   * place, or the plain file picker where the browser has no such picker. Must be called from a click or key handler.
   */
  async pickWithHandle(type: PickerType, accept: string): Promise<PickedFile | null> {
    if (!this.canWriteInPlace) {
      const file = await this.pick(accept);
      return file ? { file } : null;
    }
    try {
      const [handle] = await (window as unknown as FileAccessWindow).showOpenFilePicker!({ types: [type], multiple: false });
      if (!handle) return null;
      return { file: await handle.getFile(), handle };
    } catch (e) {
      if ((e as DOMException | null)?.name === 'AbortError') return null;
      throw e;
    }
  }

  /**
   * Reads a file again from a handle kept from an earlier visit. The browser forgets the permission between visits,
   * so it asks the person again; asking for writing too spares a second question on the first Save. Must be called
   * from a click or key handler.
   */
  async readHandle(handle: FileSystemFileHandle): Promise<ReadOutcome> {
    try {
      const permissioned = handle as unknown as PermissionedHandle;
      if (permissioned.queryPermission && (await permissioned.queryPermission({ mode: 'read' })) !== 'granted') {
        const answer = await permissioned.requestPermission?.({ mode: 'readwrite' });
        if (answer !== 'granted') return { status: 'declined' };
      }
      return { status: 'done', file: await handle.getFile() };
    } catch (e) {
      const name = (e as DOMException | null)?.name;
      if (name === 'NotFoundError') return { status: 'missing' };
      return name === 'AbortError' || name === 'NotAllowedError' ? { status: 'declined' } : { status: 'failed' };
    }
  }

  /** Writes over a file opened or saved earlier, after asking for permission to write if the browser needs it. */
  async writeTo(handle: FileSystemFileHandle, data: Blob | string): Promise<SaveOutcome> {
    try {
      const permissioned = handle as unknown as PermissionedHandle;
      if (permissioned.queryPermission && (await permissioned.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        const answer = await permissioned.requestPermission?.({ mode: 'readwrite' });
        if (answer !== 'granted') return 'declined';
      }
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return 'saved';
    } catch (e) {
      const name = (e as DOMException | null)?.name;
      return name === 'AbortError' || name === 'NotAllowedError' ? 'declined' : 'failed';
    }
  }

  /**
   * Asks where to save a file with the browser's save picker and writes it there, giving back the handle to save
   * in place next time. Where there is no such picker, it is downloaded (`save`). Must be called from a click or key handler.
   */
  async saveAs(suggestedName: string, data: Blob | string, mime: string, type: PickerType): Promise<SavedAs> {
    if (!this.canWriteInPlace) return { outcome: await this.save(suggestedName, data, mime), name: suggestedName };
    let handle: FileSystemFileHandle;
    try {
      handle = await (window as unknown as FileAccessWindow).showSaveFilePicker!({ suggestedName, types: [type] });
    } catch (e) {
      const name = (e as DOMException | null)?.name;
      return { outcome: name === 'AbortError' ? 'declined' : 'failed', name: suggestedName };
    }
    const outcome = await this.writeTo(handle, typeof data === 'string' ? new Blob([data], { type: mime }) : data);
    return { outcome, handle: outcome === 'saved' ? handle : undefined, name: handle.name };
  }

  /** Shows the file picker. Must be called from a click or key handler. */
  pick(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      let settled = false;
      const done = (file: File | null) => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(file);
      };
      input.addEventListener('change', () => done(input.files?.[0] ?? null));
      input.addEventListener('cancel', () => done(null));
      document.body.append(input);
      input.click();
    });
  }
}

export function safeFilename(title: string, ext: string): string {
  const base = title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
  return `${base || 'family-tree'}.${ext}`;
}

/** A file name for a saved tree: as `safeFilename`, with the day it was saved: `rodokmen-2026-11-20.xml`. */
export function datedFilename(title: string, ext: string, when: Date = new Date()): string {
  const day = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
  return safeFilename(title, ext).replace(/\.[^.]+$/, `-${day}.${ext}`);
}
