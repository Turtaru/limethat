import { isObject, parseEvent, parseLabels, parseManifest, serialize } from './archive-format';
import type { ArchiveSummary } from './archive-format';
import { requireValue } from './errors';

const LIMIT = 16 * 1024 * 1024;
export interface EventFileStamp { size: number; modified: number }
export interface CachedEvents { summary: ArchiveSummary; files: Map<string, EventFileStamp> }

/** Saves source strings rather than cloned parsed objects so lossless numeric IDs and unknown metadata survive cache round trips. */
export function encodeSnapshot(summary: ArchiveSummary, files: Map<string, EventFileStamp> = new Map()): string {
  return JSON.stringify({ version: 1, manifest: serialize(summary.manifest), tags: summary.tagsSource,
    events: summary.events.map(event => ({ filename: event.filename, source: event.source })),
    unreadable: summary.unreadableEvents, warnings: summary.warnings, files: [...files] });
}

export function decodeSnapshot(text: string): CachedEvents {
  requireValue(text.length <= LIMIT, 'Event snapshot exceeds cache limit');
  const value: unknown = JSON.parse(text);
  requireValue(isObject(value) && value.version === 1 && typeof value.manifest === 'string' && typeof value.tags === 'string' && Array.isArray(value.events), 'Invalid event snapshot');
  const ids = new Set<string>();
  const filenames = new Set<string>();
  const events = value.events.map(item => {
    requireValue(isObject(item) && typeof item.filename === 'string' && typeof item.source === 'string', 'Invalid cached event');
    const event = parseEvent(item.filename, item.source);
    requireValue(!ids.has(event.id.toLowerCase()) && !filenames.has(event.filename), 'Duplicate cached event');
    ids.add(event.id.toLowerCase());
    filenames.add(event.filename);
    return event;
  });
  requireValue(Array.isArray(value.unreadable) && value.unreadable.every(item => isObject(item) && typeof item.path === 'string' && typeof item.message === 'string'), 'Invalid cached failures');
  requireValue(Array.isArray(value.warnings) && value.warnings.every(item => typeof item === 'string'), 'Invalid cached warnings');
  const files = new Map<string, EventFileStamp>();
  requireValue(Array.isArray(value.files), 'Invalid cached file stamps');
  for (const item of value.files) {
    requireValue(Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && isObject(item[1]) &&
      typeof item[1].size === 'number' && Number.isFinite(item[1].size) && item[1].size >= 0 &&
      typeof item[1].modified === 'number' && Number.isFinite(item[1].modified), 'Invalid cached file stamp');
    files.set(item[0], { size: item[1].size, modified: item[1].modified });
  }
  return { summary: { manifest: parseManifest(value.manifest), tagsSource: value.tags, labels: parseLabels(value.tags), events,
    unreadableEvents: value.unreadable as ArchiveSummary['unreadableEvents'], warnings: value.warnings as string[] }, files };
}

interface SnapshotRow { id: string; root: FileSystemDirectoryHandle; text: string; savedAt: number }

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('limethat-events', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Close other tabs to access cached events.')); };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('snapshots', mode);
      const request = action(transaction.objectStore('snapshots'));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? request.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Event cache transaction aborted.'));
    });
  } finally { db.close(); }
}

export class EventSnapshotCache {
  private id: string | undefined;
  constructor(private root: FileSystemDirectoryHandle) {}

  private async find(): Promise<SnapshotRow | undefined> {
    const rows = await transaction<SnapshotRow[]>('readonly', store => store.getAll());
    for (const row of rows) {
      try { if (await this.root.isSameEntry(row.root)) { this.id = row.id; return row; } }
      catch { /* Unavailable handles cannot identify this archive. */ }
    }
  }

  async read(): Promise<(CachedEvents & { savedAt: number }) | null> {
    const row = await this.find();
    return row ? { ...decodeSnapshot(row.text), savedAt: row.savedAt } : null;
  }

  async save(summary: ArchiveSummary, files: Map<string, EventFileStamp>): Promise<void> {
    if (!this.id) await this.find();
    const id = this.id ??= crypto.randomUUID();
    const text = encodeSnapshot(summary, files);
    requireValue(new Blob([text]).size <= LIMIT, 'Event snapshot exceeds cache limit');
    await transaction('readwrite', store => {
      const request = store.getAll();
      request.addEventListener('success', () => {
        const rows = (request.result as SnapshotRow[]).filter(row => row.id !== id).sort((a, b) => b.savedAt - a.savedAt);
        for (const row of rows.slice(3)) store.delete(row.id);
        store.put({ id, root: this.root, text, savedAt: Date.now() } satisfies SnapshotRow);
      });
      return request;
    });
  }
}

export async function clearEventSnapshots(): Promise<void> {
  await transaction('readwrite', store => store.clear());
}
