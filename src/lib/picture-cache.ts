import { failure } from './errors';
import type { LoadingDiagnostics } from './loading-diagnostics';

interface CachedPicture {
  key: string;
  archive: string;
  blob: Blob;
  name: string;
  size: number;
  modified: number;
  used: number;
}

const LIMIT = 64 * 1024 * 1024;
let cacheEpoch = 0;

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('limethat-pictures', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('archives', { keyPath: 'id' });
      request.result.createObjectStore('pictures', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Close other tabs to access the picture cache.')); };
  });
}

async function stored<T>(store: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(store, mode);
      const request = action(transaction.objectStore(store));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Picture cache transaction aborted.'));
    });
  } finally { db.close(); }
}

/** Stores disposable picture bytes by archive identity; folder files remain authoritative and checks share a two-read queue. */
export class PictureCache {
  warning = '';
  private archiveId: Promise<string> | undefined;
  private epoch = cacheEpoch;
  private pending = new Map<string, Promise<File>>();
  private checked = new Map<string, number>();
  private running = 0;
  private waiting: (() => void)[] = [];

  constructor(private root: FileSystemDirectoryHandle, private read: (name: string, thumbnail: boolean) => Promise<File>, private diagnostics?: LoadingDiagnostics) {}

  private async identity(): Promise<string> {
    const archives = await stored<{ id: string; handle: FileSystemDirectoryHandle }[]>('archives', 'readonly', store => store.getAll());
    for (const archive of archives) {
      try { if (await this.root.isSameEntry(archive.handle)) return archive.id; }
      catch { /* Unavailable old handles do not identify this archive. */ }
    }
    const id = crypto.randomUUID();
    await stored('archives', 'readwrite', store => store.put({ id, handle: this.root }));
    return id;
  }

  private async optional<T>(action: () => Promise<T>): Promise<T | undefined> {
    try { return await action(); }
    catch { this.warning = 'Picture cache unavailable. Folder reads still work; cached pictures may not survive this session.'; }
  }

  private async save(row: CachedPicture, epoch: number): Promise<void> {
    if (row.blob.size > LIMIT) return;
    const db = await database();
    try {
      if (epoch !== cacheEpoch) return;
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('pictures', 'readwrite');
        const store = transaction.objectStore('pictures');
        const request = store.getAll();
        request.onsuccess = () => {
          const rows = (request.result as CachedPicture[]).filter(item => item.key !== row.key).sort((a, b) => a.used - b.used);
          let size = rows.reduce((total, item) => total + item.blob.size, row.blob.size);
          for (const item of rows) {
            if (size <= LIMIT) break;
            store.delete(item.key);
            size -= item.blob.size;
          }
          store.put(row);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  }

  private fresh(key: string, name: string, thumbnail: boolean, archive?: string, cached?: CachedPicture): Promise<File> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const epoch = cacheEpoch;
    const task = (async () => {
      if (this.running >= 2) await new Promise<void>(resolve => this.waiting.push(resolve));
      else this.running++;
      try {
        this.checked.set(key, Date.now());
        if (cached) this.diagnostics?.increment('Picture cache background checks');
        const source = await this.read(name, thumbnail);
        if (cached && source.name === cached.name && source.size === cached.size && source.lastModified === cached.modified) {
          this.diagnostics?.increment('Picture cache unchanged');
          cached.used = Date.now();
          if (epoch === cacheEpoch) await this.optional(() => stored('pictures', 'readwrite', store => epoch === cacheEpoch ? store.put(cached) : store.get(cached.key)));
          return new File([cached.blob], cached.name, { type: cached.blob.type, lastModified: cached.modified });
        }
        const bytes = await (this.diagnostics?.measure('Picture cache byte read', () => source.arrayBuffer()) ?? source.arrayBuffer());
        if (cached) this.diagnostics?.increment('Picture cache refreshed');
        const file = new File([bytes], source.name, { type: source.type, lastModified: source.lastModified });
        if (archive && epoch === cacheEpoch) await this.optional(() => this.save({ key, archive, blob: file, name: file.name, size: file.size, modified: file.lastModified, used: Date.now() }, epoch));
        this.checked.set(key, Date.now());
        return file;
      } finally {
        const next = this.waiting.shift();
        if (next) next();
        else this.running--;
      }
    })();
    this.pending.set(key, task);
    const done = () => this.pending.delete(key);
    void task.then(done, done);
    return task;
  }

  invalidate(): void {
    this.checked.clear();
  }

  async load(name: string, thumbnail: boolean): Promise<{ file: File; refresh?: Promise<File | null> }> {
    if (this.epoch !== cacheEpoch) { this.epoch = cacheEpoch; this.invalidate(); }
    this.archiveId ??= this.identity();
    const archive = await this.optional(() => this.archiveId!);
    const key = `${archive ?? 'session'}:${thumbnail ? 'thumbnail' : 'original'}:${name}`;
    const cached = archive ? await this.optional(() => stored<CachedPicture | undefined>('pictures', 'readonly', store => store.get(key))) : undefined;
    if (!cached || !(cached.blob instanceof Blob) || cached.size !== cached.blob.size || cached.archive !== archive || !Number.isFinite(cached.modified)) {
      this.diagnostics?.increment('Picture cache misses');
      return { file: await this.fresh(key, name, thumbnail, archive) };
    }
    this.diagnostics?.increment('Picture cache hits');
    const file = new File([cached.blob], cached.name, { type: cached.blob.type, lastModified: cached.modified });
    if (!this.pending.has(key) && Date.now() - (this.checked.get(key) ?? 0) < 30_000) return { file };
    const refresh = this.fresh(key, name, thumbnail, cached.archive, cached).then(file =>
      file.name === cached.name && file.size === cached.size && file.lastModified === cached.modified ? null : file
    ).catch(async error => {
      if (failure(error).code === 'unavailable') {
        await this.optional(() => stored('pictures', 'readwrite', store => store.delete(key)));
      }
      throw error;
    });
    return { file, refresh };
  }
}

export async function clearPictureCache(): Promise<void> {
  cacheEpoch++;
  await stored('pictures', 'readwrite', store => store.clear());
}
