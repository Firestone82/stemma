import { Injectable } from '@angular/core';
import { GOOGLE_CONFIG } from './google-config';

/** A file in Google Drive the tree was opened from or saved to. */
export interface DriveFile {
  id: string;
  name: string;
}

/** How a Drive request ended: `declined` when the person closed the sign-in or the picker, `blocked` when the browser stopped the sign-in pop-up. */
export type DriveOutcome<T> = { status: 'done'; value: T } | { status: 'declined' } | { status: 'blocked' } | { status: 'failed' };

/** Only files this app opens through the picker or creates itself; nothing else in the person's Drive. */
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';
const GAPI_SCRIPT = 'https://apis.google.com/js/api.js';
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

interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setCallback(callback: (result: PickerResult) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
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
  picker: {
    DocsView: new (viewId?: string) => { setMimeTypes(types: string): unknown; setMode(mode: string): unknown };
    PickerBuilder: new () => PickerBuilder;
  };
}

interface GoogleWindow {
  google?: GoogleGlobal;
  gapi?: { load(name: string, callback: () => void): void };
}

/**
 * Opening and saving trees in Google Drive: the person signs in with Google in a pop-up, picks a file in the
 * Google Picker, and the file is read and written through the Drive API, straight from the browser. Nothing goes
 * through a server of Stemma's. The Google scripts are loaded only when the File menu is first opened, so the app
 * does not talk to Google for anyone who does not use Drive.
 */
@Injectable({ providedIn: 'root' })
export class GoogleDrive {
  private ready: Promise<GoogleGlobal> | undefined;
  private token: { value: string; expires: number } | undefined;

  /** True when a Google client ID is set up (see google-config.ts). */
  get configured(): boolean {
    return !!GOOGLE_CONFIG.clientId && !!GOOGLE_CONFIG.apiKey;
  }

  /** Loads the Google scripts ahead of a click, so the sign-in pop-up opens straight from it. */
  prepare(): void {
    if (this.configured) void this.load().catch(() => (this.ready = undefined));
  }

  /** Signs in if needed and shows the Google Picker for an XML file, then reads it. */
  async open(locale: string): Promise<DriveOutcome<{ file: DriveFile; text: string }>> {
    const auth = await this.authorize();
    if (auth.status !== 'done') return auth;
    const google = auth.value.google;
    const picked = await new Promise<PickerResult>((resolve) => {
      const view = new google.picker.DocsView('all');
      view.setMimeTypes('application/xml,text/xml');
      view.setMode('list');
      new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(auth.value.token)
        .setDeveloperKey(GOOGLE_CONFIG.apiKey)
        .setAppId(GOOGLE_CONFIG.appId)
        .setLocale(locale)
        .setCallback((result) => {
          if (result.action === 'picked' || result.action === 'cancel') resolve(result);
        })
        .build()
        .setVisible(true);
    });
    const doc = picked.action === 'picked' ? picked.docs?.[0] : undefined;
    if (!doc) return { status: 'declined' };
    try {
      const response = await fetch(`${FILES}/${encodeURIComponent(doc.id)}?alt=media`, { headers: this.headers(auth.value.token) });
      if (!response.ok) return this.failed(response);
      return { status: 'done', value: { file: { id: doc.id, name: doc.name }, text: await response.text() } };
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

  /** A refused token is forgotten, so the next try signs in again. */
  private failed(response: Response): DriveOutcome<never> {
    if (response.status === 401) this.token = undefined;
    return { status: 'failed' };
  }

  /** An access token for the `drive.file` scope, kept until shortly before it runs out. */
  private async authorize(): Promise<DriveOutcome<{ google: GoogleGlobal; token: string }>> {
    let google: GoogleGlobal;
    try {
      google = await this.load();
    } catch {
      this.ready = undefined;
      return { status: 'failed' };
    }
    if (this.token && this.token.expires > Date.now()) return { status: 'done', value: { google, token: this.token.value } };
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
          resolve({ status: 'done', value: { google, token: response.access_token } });
        },
        error_callback: (error) => resolve({ status: error.type === 'popup_failed_to_open' ? 'blocked' : 'declined' }),
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  private load(): Promise<GoogleGlobal> {
    this.ready ??= Promise.all([script(GIS_SCRIPT), script(GAPI_SCRIPT)]).then(
      () =>
        new Promise<GoogleGlobal>((resolve, reject) => {
          const w = window as unknown as GoogleWindow;
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
