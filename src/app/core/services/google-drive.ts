import { Injectable } from '@angular/core';
import { GOOGLE_CONFIG } from './google-config';

/** A file in Google Drive the tree was opened from or saved to. */
export interface DriveFile {
  id: string;
  name: string;
}

/** A tree in the list of files Stemma may open in Drive, with when it was last changed. */
export interface DriveListing extends DriveFile {
  modified: number;
}

/**
 * How a Drive request ended: `declined` when the person closed the sign-in, `blocked` when the browser
 * stopped the sign-in pop-up, `missing` when the file is no longer there (deleted, or no longer shared with the app),
 * `denied` when the person may only read the file (shared with them for viewing).
 */
export type DriveOutcome<T> =
  { status: 'done'; value: T } | { status: 'declined' } | { status: 'blocked' } | { status: 'missing' } | { status: 'denied' } | { status: 'failed' };

/** Only files this app creates itself (or was given by the person); nothing else in the person's Drive. */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const GAPI_SCRIPT = 'https://apis.google.com/js/api.js';
const XML_TYPES = 'application/xml,text/xml';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

// The parts of Google Identity Services and the Google Picker used here.
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface PickerResult {
  action: string;
  docs?: { id: string; name: string }[];
}

interface DocsView {
  setMimeTypes(types: string): DocsView;
  setIncludeFolders(include: boolean): DocsView;
  setSelectFolderEnabled(enabled: boolean): DocsView;
  setOwnedByMe(owned: boolean): DocsView;
  setEnableDrives(enabled: boolean): DocsView;
  setParent(id: string): DocsView;
  setLabel(label: string): DocsView;
  setMode(mode: string): DocsView;
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(callback: (result: PickerResult) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

/** What the person picks in the Google Picker: a tree to open, or the folder to save a new one in. */
export type DriveTarget = 'file' | 'folder';

interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }): TokenClient;
    };
  };
  picker?: {
    DocsView: new (viewId?: string) => DocsView;
    PickerBuilder: new () => PickerBuilder;
  };
}

interface GoogleWindow {
  google?: GoogleGlobal;
  gapi?: { load(name: string, callback: () => void): void };
}

/**
 * Opening and saving trees in Google Drive: the person signs in with Google in a pop-up, and the files are listed,
 * read and written through the Drive API, straight from the browser. Nothing goes through a server of Stemma's.
 * With the `drive.file` scope the app sees only the files it saved itself and the ones the person picks in the Google
 * Picker. The Picker (which needs an API key besides the client ID) opens any tree the person can see, shared ones
 * too, and picks the folder a new tree is saved in. Without an API key the app lists just the trees it saved itself
 * and saves new ones in the top folder. The Google scripts are loaded only when a Drive item is about to be used, so
 * the app does not talk to Google for anyone who does not use Drive.
 */
@Injectable({ providedIn: 'root' })
export class GoogleDrive {
  private ready: Promise<GoogleGlobal> | undefined;
  private token: { value: string; expires: number } | undefined;

  /** True when a Google Cloud project is set up (see google-config.ts). */
  get configured(): boolean {
    return !!GOOGLE_CONFIG.clientId;
  }

  /** True when the Google Picker can be used (an API key is set), so trees can be picked anywhere in Drive. */
  get picks(): boolean {
    return this.configured && !!GOOGLE_CONFIG.apiKey;
  }

  /** Loads the Google script ahead of a click, so the sign-in pop-up opens straight from it. */
  prepare(): void {
    if (this.configured) void this.load().catch(() => (this.ready = undefined));
  }

  /**
   * Signs in if needed and shows the Google Picker: for a tree to open (in My Drive, shared with the person, or in a
   * shared drive), or for the folder to save a new tree in. Picking grants the app access to just that file or folder.
   */
  async pick(target: DriveTarget, locale: string, title: string): Promise<DriveOutcome<DriveFile>> {
    const auth = await this.authorize();
    if (auth.status !== 'done') return auth;
    let google: GoogleGlobal;
    try {
      google = await this.load();
    } catch {
      this.ready = undefined;
      return { status: 'failed' };
    }
    const picker = google.picker;
    if (!picker) return { status: 'failed' };
    const builder = new picker.PickerBuilder()
      .enableFeature('sdr')
      .setOAuthToken(auth.value.token)
      .setDeveloperKey(GOOGLE_CONFIG.apiKey)
      .setAppId(GOOGLE_CONFIG.appId)
      .setLocale(locale)
      .setTitle(title);
    if (target === 'file') {
      builder
        .addView(new picker.DocsView('all').setMimeTypes(XML_TYPES).setIncludeFolders(true).setOwnedByMe(true).setMode('list'))
        .addView(new picker.DocsView('all').setMimeTypes(XML_TYPES).setOwnedByMe(false).setMode('list'))
        .addView(new picker.DocsView('all').setMimeTypes(XML_TYPES).setEnableDrives(true).setIncludeFolders(true).setMode('list'));
    } else {
      builder
        .addView(new picker.DocsView('folders').setMimeTypes(FOLDER_TYPE).setIncludeFolders(true).setSelectFolderEnabled(true).setParent('root'))
        .addView(new picker.DocsView('folders').setMimeTypes(FOLDER_TYPE).setIncludeFolders(true).setSelectFolderEnabled(true).setOwnedByMe(false))
        .addView(new picker.DocsView('folders').setMimeTypes(FOLDER_TYPE).setIncludeFolders(true).setSelectFolderEnabled(true).setEnableDrives(true));
    }
    const picked = await new Promise<PickerResult>((resolve) => {
      builder
        .setCallback((result) => {
          if (result.action === 'picked' || result.action === 'cancel') resolve(result);
        })
        .build()
        .setVisible(true);
    });
    const doc = picked.action === 'picked' ? picked.docs?.[0] : undefined;
    return doc ? { status: 'done', value: { id: doc.id, name: doc.name } } : { status: 'declined' };
  }

  /** Signs in if needed and lists the trees Stemma may open in Drive (the XML files it saved there), newest first. */
  async list(): Promise<DriveOutcome<DriveListing[]>> {
    const auth = await this.authorize();
    if (auth.status !== 'done') return auth;
    const query = new URLSearchParams({
      q: "trashed = false and (mimeType = 'application/xml' or mimeType = 'text/xml')",
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,modifiedTime)',
      pageSize: '200',
      spaces: 'drive',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    try {
      const response = await fetch(`${FILES}?${query}`, { headers: this.headers(auth.value.token) });
      if (!response.ok) return this.failed(response);
      const body = (await response.json()) as { files?: { id: string; name: string; modifiedTime?: string }[] };
      const files = (body.files ?? []).map((f) => ({ id: f.id, name: f.name, modified: f.modifiedTime ? Date.parse(f.modifiedTime) : 0 }));
      return { status: 'done', value: files };
    } catch {
      return { status: 'failed' };
    }
  }

  /** Reads a file opened from or saved to Drive earlier again (the recent files), signing in if needed. */
  async read(file: DriveFile): Promise<DriveOutcome<{ file: DriveFile; text: string }>> {
    const auth = await this.authorize();
    if (auth.status !== 'done') return auth;
    try {
      const headers = this.headers(auth.value.token);
      const id = encodeURIComponent(file.id);
      const meta = await fetch(`${FILES}/${id}?fields=id,name,trashed&supportsAllDrives=true`, { headers });
      if (!meta.ok) return this.failed(meta);
      const info = (await meta.json()) as DriveFile & { trashed?: boolean };
      if (info.trashed) return { status: 'missing' };
      const response = await fetch(`${FILES}/${id}?alt=media&supportsAllDrives=true`, { headers });
      if (!response.ok) return this.failed(response);
      return { status: 'done', value: { file: { id: info.id, name: info.name }, text: await response.text() } };
    } catch {
      return { status: 'failed' };
    }
  }

  /** Writes the tree over a file opened from or saved to Drive earlier. */
  async update(file: DriveFile, xml: string): Promise<DriveOutcome<DriveFile>> {
    const auth = await this.authorize();
    if (auth.status !== 'done') return auth;
    try {
      const response = await fetch(`${UPLOAD}/${encodeURIComponent(file.id)}?uploadType=media&fields=id,name&supportsAllDrives=true`, {
        method: 'PATCH',
        headers: { ...this.headers(auth.value.token), 'Content-Type': 'application/xml' },
        body: xml,
      });
      if (!response.ok) return this.failed(response);
      return { status: 'done', value: (await response.json()) as DriveFile };
    } catch {
      return { status: 'failed' };
    }
  }

  /** Saves the tree as a new file in `folder` (picked in the Picker), or else in the top folder of the person's Drive. */
  async create(name: string, xml: string, folder?: DriveFile): Promise<DriveOutcome<DriveFile>> {
    const auth = await this.authorize();
    if (auth.status !== 'done') return auth;
    const boundary = `stemma-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify({ name, mimeType: 'application/xml', ...(folder ? { parents: [folder.id] } : {}) }),
      `\r\n--${boundary}\r\nContent-Type: application/xml\r\n\r\n`,
      xml,
      `\r\n--${boundary}--`,
    ]);
    try {
      const response = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,name&supportsAllDrives=true`, {
        method: 'POST',
        headers: { ...this.headers(auth.value.token), 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      if (!response.ok) return this.failed(response);
      return { status: 'done', value: (await response.json()) as DriveFile };
    } catch {
      return { status: 'failed' };
    }
  }

  private headers(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  /** A refused token is forgotten, so the next try signs in again. A file Drive does not know (or no longer lets the app see) is missing. */
  private failed(response: Response): DriveOutcome<never> {
    if (response.status === 401) this.token = undefined;
    if (response.status === 404) return { status: 'missing' };
    if (response.status === 403) return { status: 'denied' };
    return { status: 'failed' };
  }

  /** An access token for the `drive.file` scope, kept until shortly before it runs out. */
  private async authorize(): Promise<DriveOutcome<{ token: string }>> {
    let google: GoogleGlobal;
    try {
      google = await this.load();
    } catch {
      this.ready = undefined;
      return { status: 'failed' };
    }
    if (this.token && this.token.expires > Date.now()) return { status: 'done', value: { token: this.token.value } };
    return new Promise((resolve) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.clientId,
        scope: SCOPE,
        callback: (response) => {
          if (!response.access_token) {
            resolve({ status: response.error === 'access_denied' ? 'declined' : 'failed' });
            return;
          }
          this.token = { value: response.access_token, expires: Date.now() + ((response.expires_in ?? 3600) - 60) * 1000 };
          resolve({ status: 'done', value: { token: response.access_token } });
        },
        error_callback: (error) => resolve({ status: error.type === 'popup_failed_to_open' ? 'blocked' : 'declined' }),
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  private load(): Promise<GoogleGlobal> {
    this.ready ??= Promise.all([script(GIS_SCRIPT), this.picks ? script(GAPI_SCRIPT) : Promise.resolve()]).then(
      () =>
        new Promise<GoogleGlobal>((resolve, reject) => {
          const w = window as unknown as GoogleWindow;
          if (!w.google?.accounts?.oauth2) {
            reject(new Error('Google Identity Services did not load.'));
            return;
          }
          if (!this.picks) {
            resolve(w.google);
            return;
          }
          if (!w.gapi) {
            reject(new Error('The Google API script did not load.'));
            return;
          }
          w.gapi.load('picker', () => (w.google ? resolve(w.google) : reject(new Error('Google Identity Services did not load.'))));
        }),
    );
    return this.ready;
  }
}

/** Adds a script to the page once and waits for it. */
function script(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset['loaded']) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = existing ?? document.createElement('script');
    el.addEventListener('load', () => {
      el.dataset['loaded'] = 'true';
      resolve();
    });
    el.addEventListener('error', () => {
      el.remove();
      reject(new Error(`Could not load ${src}.`));
    });
    if (!existing) {
      el.src = src;
      el.async = true;
      document.head.append(el);
    }
  });
}
