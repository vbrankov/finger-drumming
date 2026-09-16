const DB_NAME = 'finger-drumming';
const STORE = 'samples';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export function putBlob(id: string, blob: Blob): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(blob, id));
}

export function getBlob(id: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(id));
}

export function deleteBlob(id: string): Promise<undefined> {
  return tx('readwrite', (s) => s.delete(id));
}

export function newBlobId(): string {
  return crypto.randomUUID();
}
