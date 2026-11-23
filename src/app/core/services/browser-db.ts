/**
 * The app's IndexedDB database: `autosave` holds a big tree that does not fit in localStorage (see state/autosave.ts),
 * `recent` the files opened lately (see recent-files.ts). Both stores are opened here, so their versions agree.
 */
const DB_NAME = 'stemma';
const DB_VERSION = 2;
export const AUTOSAVE_STORE = 'autosave';
export const RECENT_STORE = 'recent';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('no IndexedDB'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of [AUTOSAVE_STORE, RECENT_STORE]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs one request on a store and waits for its transaction to finish. */
export async function idbRun<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = run(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
