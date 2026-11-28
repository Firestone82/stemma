import { TestBed } from '@angular/core/testing';
import { GoogleDrive, pinPickerAccount, shareLink, sharedFileId } from './google-drive';

describe('pinPickerAccount', () => {
  afterEach(() => document.querySelectorAll('iframe').forEach((f) => f.remove()));

  it('adds the account to a Picker frame before its fragment, once', async () => {
    const release = pinPickerAccount('pavel@example.com');
    const frame = document.createElement('iframe');
    frame.setAttribute('src', 'https://docs.google.com/picker?protocol=gadgets&appId=1#rpctoken=abc&id=x');
    document.body.append(frame);
    await Promise.resolve();
    expect(frame.getAttribute('src')).toBe('https://docs.google.com/picker?protocol=gadgets&appId=1&authuser=pavel%40example.com#rpctoken=abc&id=x');
    release();
  });

  it('leaves other frames alone', async () => {
    const release = pinPickerAccount('pavel@example.com');
    const frame = document.createElement('iframe');
    frame.setAttribute('src', 'https://example.com/page');
    document.body.append(frame);
    await Promise.resolve();
    expect(frame.getAttribute('src')).toBe('https://example.com/page');
    release();
  });
});

describe('GoogleDrive.details', () => {
  /** Drive's answers by file id; a missing id is one the app may not read (404). */
  function driveWith(files: Record<string, object>): GoogleDrive {
    sessionStorage.setItem('stemma.drive-token', JSON.stringify({ value: 't', expires: Date.now() + 60_000 }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const id = decodeURIComponent(url.split('/files/')[1].split('?')[0]);
        const file = files[id];
        return file ? new Response(JSON.stringify(file)) : new Response('', { status: 404 });
      }),
    );
    return TestBed.inject(GoogleDrive);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('gives the folders down from My Drive, and when the file was changed', async () => {
    const drive = driveWith({
      f: { id: 'f', name: 'tree.xml', parents: ['b'], modifiedTime: '2026-11-28T10:00:00Z', ownedByMe: true },
      b: { id: 'b', name: 'Trees', parents: ['a'] },
      a: { id: 'a', name: 'Family', parents: ['r'] },
      root: { id: 'r', name: 'My Drive' },
    });
    expect(await drive.details({ id: 'f', name: 'tree.xml' })).toEqual({
      saved: Date.parse('2026-11-28T10:00:00Z'),
      top: 'mine',
      folders: ['Family', 'Trees'],
    });
  });

  it('knows a file at the top of My Drive even when the app may not read that folder', async () => {
    const drive = driveWith({ f: { id: 'f', name: 'tree.xml', parents: ['r'], ownedByMe: true }, root: { id: 'r', name: 'My Drive' } });
    expect((await drive.details({ id: 'f', name: 'tree.xml' }))?.folders).toEqual([]);
  });

  it('marks folders it may not read, and files shared by someone else', async () => {
    const drive = driveWith({
      f: { id: 'f', name: 'tree.xml', parents: ['b'], ownedByMe: false },
      b: { id: 'b', name: 'Trees', parents: ['hidden'] },
    });
    expect(await drive.details({ id: 'f', name: 'tree.xml' })).toMatchObject({ top: 'shared', folders: ['…', 'Trees'] });
  });

  it('asks nothing without a kept sign-in', async () => {
    const drive = driveWith({});
    sessionStorage.clear();
    TestBed.resetTestingModule();
    expect(await TestBed.inject(GoogleDrive).details({ id: 'f', name: 'x' })).toBeNull();
    expect(drive).toBeDefined();
  });
});

describe('shared links', () => {
  const id = '1AbCdEfGhIjKlMnOp_q-r';

  it('puts the file id on the page address', () => {
    expect(shareLink(id, { origin: 'https://firestone82.github.io', pathname: '/stemma/' })).toBe(`https://firestone82.github.io/stemma/?drive=${id}`);
  });

  it('reads the file id from the address, or from a Drive link pasted there', () => {
    expect(sharedFileId(`?drive=${id}`)).toBe(id);
    expect(sharedFileId(`?drive=${encodeURIComponent(`https://drive.google.com/file/d/${id}/view?usp=sharing`)}`)).toBe(id);
    expect(sharedFileId(`?drive=${encodeURIComponent(`https://drive.google.com/open?id=${id}`)}`)).toBe(id);
    expect(sharedFileId('?drive=')).toBeNull();
    expect(sharedFileId('?drive=<script>')).toBeNull();
    expect(sharedFileId('')).toBeNull();
  });
});

describe('GoogleDrive.readShared', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads a public file with only the API key, no sign-in', async () => {
    const fetched: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        fetched.push({ url, init });
        return url.includes('alt=media') ? new Response('<tree/>') : new Response(JSON.stringify({ id: 'f1234567890', name: 'tree.xml', size: '7' }));
      }),
    );
    const outcome = await TestBed.inject(GoogleDrive).readShared('f1234567890');
    expect(outcome).toEqual({ status: 'done', value: { file: { id: 'f1234567890', name: 'tree.xml' }, text: '<tree/>' } });
    expect(fetched.every(({ url, init }) => url.includes('key=') && !init?.headers)).toBe(true);
  });

  it('calls a file Drive does not show to strangers missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    expect(await TestBed.inject(GoogleDrive).readShared('f1234567890')).toEqual({ status: 'missing' });
    expect(await TestBed.inject(GoogleDrive).sharing('f1234567890')).toBe('private');
  });
});

describe('Google Drive write requests', () => {
  beforeEach(() => {
    sessionStorage.setItem('stemma.drive-token', JSON.stringify({ value: 't', expires: Date.now() + 60_000 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('upgrades an existing anyone-with-the-link permission to editor', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PATCH' ? new Response('{}') : Response.json({ permissions: [{ id: 'public', type: 'anyone', role: 'reader' }] }),
    );
    vi.stubGlobal('fetch', fetch);
    const result = await TestBed.inject(GoogleDrive).sharePublicly({ id: 'file', name: 'tree.xml' }, 'writer');

    expect(result).toEqual({ status: 'done', value: true });
    expect(fetch.mock.calls[1][0]).toContain('/files/file/permissions/public?');
    expect(JSON.parse(fetch.mock.calls[1][1]?.body as string)).toEqual({ role: 'writer', allowFileDiscovery: false });
  });

  it('reports uploaded bytes when replacing an existing Drive file', async () => {
    class Request {
      status = 200;
      response = { id: 'file', name: 'tree.xml' };
      upload: { onprogress?: (event: Partial<ProgressEvent>) => void } = {};
      onload?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send(body: Blob): void {
        this.upload.onprogress?.({ loaded: body.size, total: body.size, lengthComputable: true });
        this.onload?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', Request);
    const progress = vi.fn();
    const file = { id: 'file', name: 'tree.xml' };

    expect(await TestBed.inject(GoogleDrive).update(file, '<tree/>', progress)).toEqual({ status: 'done', value: file });
    expect(progress.mock.calls).toEqual([
      [0, 7],
      [7, 7],
    ]);
  });
});
