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
 * stopped the sign-in pop-up, `missing` when the file is no longer there (deleted, or no longer shared with the app).
 */
export type DriveOutcome<T> = { status: 'done'; value: T } | { status: 'declined' } | { status: 'blocked' } | { status: 'missing' } | { status: 'failed' };

/** Only files this app creates itself (or was given by the person); nothing else in the person's Drive. */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

// The parts of Google Identity Services used here.
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

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
}

interface GoogleWindow {
  google?: GoogleGlobal;
}

/**
 * Opening and saving trees in Google Drive: the person signs in with Google in a pop-up, and the files are listed,
 * read and written through the Drive API, straight from the browser. Nothing goes through a server of Stemma's.
 * Only an OAuth client ID is needed (no API key): with the `drive.file` scope Drive lists just the files Stemma
 * saved there itself, so the app shows its own list instead of the Google Picker (which would need an API key).
 * The Google script is loaded only when a Drive item is about to be used, so the app does not talk to Google for
 * anyone who does not use Drive.
 */
@Injectable({ providedIn: 'root' })
export class GoogleDrive {
  private ready: Promise<GoogleGlobal> | undefined;
  private token: { value: string; expires: number } | undefined;

  /** True when a Google Cloud project is set up (see google-config.ts). */
  get configured(): boolean {
    return !!GOOGLE_CONFIG.clientId;
  }

  /** Loads the Google script ahead of a click, so the sign-in pop-up opens straight from it. */
  prepare(): void {
    if (this.configured) void this.load().catch(() => (this.ready = undefined));
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
      const meta = await fetch(`${FILES}/${id}?fields=id,name,trashed`, { headers });
      if (!meta.ok) return this.failed(meta);
      const info = (await meta.json()) as DriveFile & { trashed?: boolean };
      if (info.trashed) return { status: 'missing' };
      const response = await fetch(`${FILES}/${id}?alt=media`, { headers });
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
      const response = await fetch(`${UPLOAD}/${encodeURIComponent(file.id)}?uploadType=media&fields=id,name`, {
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

  /** Saves the tree as a new file in the top folder of the person's Drive. */
  async create(name: string, xml: string): Promise<DriveOutcome<DriveFile>> {
    const auth = await this.authorize();
    if (auth.status !== 'done') return auth;
    const boundary = `stemma-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify({ name, mimeType: 'application/xml' }),
      `\r\n--${boundary}\r\nContent-Type: application/xml\r\n\r\n`,
      xml,
      `\r\n--${boundary}--`,
    ]);
    try {
      const response = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,name`, {
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
    this.ready ??= script(GIS_SCRIPT).then(() => {
      const google = (window as unknown as GoogleWindow).google;
      if (!google?.accounts?.oauth2) throw new Error('Google Identity Services did not load.');
      return google;
    });
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
