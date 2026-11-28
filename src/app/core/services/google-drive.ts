import { Injectable } from '@angular/core';
import { GOOGLE_CONFIG } from './google-config';
import type { DriveDetails } from './recent-files';

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
/** Where the access token is kept for this tab (see `GoogleDrive.token`). */
const TOKEN_KEY = 'stemma.drive-token';
/** The Google account last signed in with, so the next sign-in and the Picker use that same account. */
const ACCOUNT_KEY = 'stemma.drive-account';
const XML_TYPES = 'application/xml,text/xml';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const ABOUT = 'https://www.googleapis.com/drive/v3/about';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
/** The address parameter that carries a shared tree's Drive file id (see `shareLink`). */
export const SHARE_PARAM = 'drive';

/** Whether a Drive file can be opened by anyone with its link: `null` when Drive could not be asked. */
export type DriveSharing = 'public' | 'private' | null;

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
        login_hint?: string;
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
  /** The id of the top folder of My Drive, asked once (`null` where Drive will not tell). */
  private rootId: Promise<string | null> | undefined;
  private kept: { value: string; expires: number } | undefined = readToken();
  /** The e-mail of the account the token belongs to (see `account`). */
  private email: string | undefined = readItem(localStorageOrNull(), ACCOUNT_KEY);
  /** The token `email` was last checked with. */
  private emailChecked: string | undefined;

  /**
   * The access token, kept for this tab in sessionStorage until shortly before it runs out, so reloading the page or
   * opening another tree does not ask to sign in again within the hour.
   */
  private get token(): { value: string; expires: number } | undefined {
    return this.kept && this.kept.expires > Date.now() ? this.kept : undefined;
  }

  private set token(token: { value: string; expires: number } | undefined) {
    this.kept = token;
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage may be blocked; the token is then kept only until the page is left.
    }
  }

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
    const account = await this.account(auth.value.token);
    const builder = new picker.PickerBuilder()
      .enableFeature('sdr')
      .setOAuthToken(auth.value.token)
      .setDeveloperKey(GOOGLE_CONFIG.apiKey)
      .setAppId(GOOGLE_CONFIG.appId)
      .setLocale(locale)
      .setTitle(title);
    // The Picker otherwise uses the browser's default Google account, and when that is not the one the token belongs
    // to it refuses to load (401) and falls back to a sign-in window that cannot hand the pick back. `setAuthUser` is
    // not documented, so it is used only where the library has it; otherwise the frame's address gets `authuser`.
    const withUser = builder as PickerBuilder & { setAuthUser?(user: string): PickerBuilder };
    if (account && typeof withUser.setAuthUser === 'function') withUser.setAuthUser(account);
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
    const release = account && typeof withUser.setAuthUser !== 'function' ? pinPickerAccount(account) : () => undefined;
    const picked = await new Promise<PickerResult>((resolve) => {
      builder
        .setCallback((result) => {
          if (result.action === 'picked' || result.action === 'cancel') resolve(result);
        })
        .build()
        .setVisible(true);
    }).finally(release);
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

  /**
   * Reads a file opened from or saved to Drive earlier again (the recent files), signing in if needed. `progress` hears
   * how much has come so far, out of the file's size where Drive gives it.
   */
  async read(file: DriveFile, progress?: (loaded: number, total: number | null) => void): Promise<DriveOutcome<{ file: DriveFile; text: string }>> {
    const auth = await this.authorize();
    if (auth.status !== 'done') return auth;
    try {
      const headers = this.headers(auth.value.token);
      const id = encodeURIComponent(file.id);
      const meta = await fetch(`${FILES}/${id}?fields=id,name,trashed,size&supportsAllDrives=true`, { headers });
      if (!meta.ok) return this.failed(meta);
      const info = (await meta.json()) as DriveFile & { trashed?: boolean; size?: string };
      if (info.trashed) return { status: 'missing' };
      const total = info.size ? Number(info.size) : null;
      progress?.(0, total);
      const response = await fetch(`${FILES}/${id}?alt=media&supportsAllDrives=true`, { headers });
      if (!response.ok) return this.failed(response);
      const text = await readText(response, (loaded) => progress?.(loaded, total));
      return { status: 'done', value: { file: { id: info.id, name: info.name }, text } };
    } catch {
      return { status: 'failed' };
    }
  }

  /**
   * Reads a tree shared as "anyone with the link" in Drive, with no sign-in: only the API key goes with the request,
   * so Drive answers just for files anyone may see. `missing` when the file is not shared that way (Drive then says it
   * does not know it) or is gone; `failed` without an API key or when Drive cannot be reached.
   */
  async readShared(
    id: string,
    progress?: (file: DriveFile, loaded: number, total: number | null) => void,
  ): Promise<DriveOutcome<{ file: DriveFile; text: string }>> {
    if (!GOOGLE_CONFIG.apiKey) return { status: 'failed' };
    try {
      const key = encodeURIComponent(GOOGLE_CONFIG.apiKey);
      const path = `${FILES}/${encodeURIComponent(id)}`;
      const meta = await fetch(`${path}?fields=id,name,trashed,size&supportsAllDrives=true&key=${key}`);
      if (!meta.ok) return this.failedShared(meta);
      const info = (await meta.json()) as DriveFile & { trashed?: boolean; size?: string };
      if (info.trashed) return { status: 'missing' };
      const file = { id: info.id, name: info.name };
      const total = info.size ? Number(info.size) : null;
      progress?.(file, 0, total);
      const response = await fetch(`${path}?alt=media&supportsAllDrives=true&key=${key}`);
      if (!response.ok) return this.failedShared(response);
      const text = await readText(response, (loaded) => progress?.(file, loaded, total));
      return { status: 'done', value: { file, text } };
    } catch {
      return { status: 'failed' };
    }
  }

  /** Whether anyone with the link can open the file now (asked as a stranger would, with only the API key). */
  async sharing(id: string): Promise<DriveSharing> {
    if (!GOOGLE_CONFIG.apiKey) return null;
    try {
      const response = await fetch(`${FILES}/${encodeURIComponent(id)}?fields=id&supportsAllDrives=true&key=${encodeURIComponent(GOOGLE_CONFIG.apiKey)}`);
      if (response.ok) return 'public';
      return response.status === 404 ? 'private' : null;
    } catch {
      return null;
    }
  }

  /**
   * Lets anyone with the link view the file (Drive's "Anyone with the link: Viewer"), signing in if needed. `denied`
   * when the person may not change who the file is shared with (not theirs, or their organisation does not allow it).
   */
  async sharePublicly(file: DriveFile): Promise<DriveOutcome<true>> {
    const auth = await this.authorize();
    if (auth.status !== 'done') return auth;
    try {
      const response = await fetch(`${FILES}/${encodeURIComponent(file.id)}/permissions?supportsAllDrives=true`, {
        method: 'POST',
        headers: { ...this.headers(auth.value.token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }),
      });
      if (!response.ok) return this.failed(response);
      return { status: 'done', value: true };
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

  /**
   * When a file was last changed and where it is, for the recent files: the folders it is in, from the top of My Drive
   * down, or that it was shared with the person by someone else. Asked only with the sign-in already given (after the
   * file was read or written, or still kept for this tab), so it never opens a pop-up; `null` when Drive cannot be asked.
   * With the `drive.file` scope the app may read only the folders it made or the person picked; a folder above those
   * ends the path, shown as "…" in its place.
   */
  async details(file: DriveFile): Promise<DriveDetails | null> {
    const token = this.token;
    if (!token) return null;
    const headers = this.headers(token.value);
    const get = async (id: string, fields = 'id,name,parents') => {
      const response = await fetch(`${FILES}/${encodeURIComponent(id)}?fields=${fields}&supportsAllDrives=true`, { headers });
      if (!response.ok) return null;
      return (await response.json()) as { id: string; name: string; parents?: string[]; modifiedTime?: string; ownedByMe?: boolean; driveId?: string };
    };
    try {
      const info = await get(file.id, 'id,name,parents,modifiedTime,ownedByMe,driveId');
      if (!info) return null;
      this.rootId ??= get('root', 'id')
        .then((root) => root?.id ?? null)
        .catch(() => null);
      const root = await this.rootId;
      const folders: string[] = [];
      let parent = info.parents?.[0];
      let complete = !parent;
      for (let depth = 0; parent && depth < 20; depth++) {
        if (parent === root) {
          complete = true;
          break;
        }
        const folder = await get(parent);
        if (!folder) break;
        // The top of My Drive (or of a shared drive, whose name is kept) has no parents.
        if (!folder.parents?.length) {
          if (folder.id === info.driveId) folders.unshift(folder.name);
          complete = true;
          break;
        }
        folders.unshift(folder.name);
        parent = folder.parents[0];
      }
      const top: DriveDetails['top'] = info.driveId ? 'shared-drive' : info.ownedByMe === false ? 'shared' : 'mine';
      return {
        saved: info.modifiedTime ? Date.parse(info.modifiedTime) : Date.now(),
        top,
        folders: complete ? folders : ['…', ...folders],
      };
    } catch {
      return null;
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

  /** Without a sign-in, Drive says it does not know a file that is not shared with anyone who has the link. */
  private failedShared(response: Response): DriveOutcome<never> {
    return response.status === 404 ? { status: 'missing' } : { status: 'failed' };
  }

  /** The e-mail of the account the token belongs to, asked from Drive once and kept for the next sign-in. */
  private async account(token: string): Promise<string | undefined> {
    if (this.email && this.emailChecked === token) return this.email;
    try {
      const response = await fetch(`${ABOUT}?fields=user(emailAddress)`, { headers: this.headers(token) });
      if (!response.ok) return this.email;
      const body = (await response.json()) as { user?: { emailAddress?: string } };
      const email = body.user?.emailAddress;
      if (email) {
        this.email = email;
        this.emailChecked = token;
        try {
          localStorage.setItem(ACCOUNT_KEY, email);
        } catch {
          // Blocked storage: the account is then remembered only for this page.
        }
      }
    } catch {
      // Without it the Picker uses the browser's default account.
    }
    return this.email;
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
        ...(this.email ? { login_hint: this.email } : {}),
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

/** The Stemma address that opens a tree in Drive for anyone with the link: this page with `?drive=<file id>`. */
export function shareLink(id: string, at: { origin: string; pathname: string } = location): string {
  return `${at.origin}${at.pathname}?${SHARE_PARAM}=${encodeURIComponent(id)}`;
}

/**
 * The Drive file id a page address asks to open (`?drive=`), or `null`. Besides a bare id it takes a Drive link
 * pasted in its place (…/file/d/<id>/view, …?id=<id>), so a link copied from Drive's own Share button works too.
 */
export function sharedFileId(search: string): string | null {
  const value = new URLSearchParams(search).get(SHARE_PARAM)?.trim();
  if (!value) return null;
  const id = /\/d\/([\w-]+)/.exec(value)?.[1] ?? /[?&]id=([\w-]+)/.exec(value)?.[1] ?? value;
  return /^[\w-]{10,}$/.test(id) ? id : null;
}

/** The file's page in Google Drive, where its Share button is. */
export function driveFilePage(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readItem(storage: Storage | null, key: string): string | undefined {
  try {
    return storage?.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Makes the Picker's frame open as `account`. The frame is docs.google.com, which picks the browser's default Google
 * account from its cookies; with several accounts signed in, that may not be the one the token belongs to, and the
 * Picker then refuses to load (401) and falls back to a separate sign-in window that cannot hand the pick back. Google
 * pages take the account to use from an `authuser` parameter, which the Picker library has no documented way to set,
 * so it is added to the frame's address as the frame appears (before the `#` part, which carries the frame's link back
 * to this page). Returns a function that stops watching.
 */
export function pinPickerAccount(account: string): () => void {
  const pin = (frame: HTMLIFrameElement): void => {
    const src = frame.getAttribute('src') ?? '';
    if (!src.startsWith('https://docs.google.com/picker') || /[?&]authuser=/.test(src)) return;
    const hash = src.indexOf('#');
    const base = hash < 0 ? src : src.slice(0, hash);
    const fragment = hash < 0 ? '' : src.slice(hash);
    frame.setAttribute('src', `${base}${base.includes('?') ? '&' : '?'}authuser=${encodeURIComponent(account)}${fragment}`);
  };
  const scan = (root: ParentNode): void => root.querySelectorAll('iframe').forEach(pin);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLIFrameElement) pin(mutation.target);
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLIFrameElement) pin(node);
        else if (node instanceof Element) scan(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  scan(document);
  return () => observer.disconnect();
}

/** The access token kept for this tab by an earlier page load, if it has not run out. */
function readToken(): { value: string; expires: number } | undefined {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(TOKEN_KEY);
    const token = raw ? (JSON.parse(raw) as { value?: unknown; expires?: unknown }) : null;
    if (token && typeof token.value === 'string' && typeof token.expires === 'number' && token.expires > Date.now()) {
      return { value: token.value, expires: token.expires };
    }
  } catch {
    // Unreadable or blocked storage: sign in again.
  }
  return undefined;
}

/** The body of a response as text, telling `progress` how many bytes have come so far. */
async function readText(response: Response, progress: (loaded: number) => void): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const decoder = new TextDecoder();
  let text = '';
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    text += decoder.decode(value, { stream: true });
    progress(loaded);
  }
  return text + decoder.decode();
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
