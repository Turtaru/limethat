import {
  PICTURE_LIMIT, TEXT_LIMIT, editEvent, labelKey, newEvent, nextLabelId, parseEvent,
  isObject, json, parseLabels, parseManifest, safeName, serialize, updateMetadata, validateFrame, validateText,
} from './archive-format';
import type { ArchiveEvent, ArchiveSummary, EventDraft, Label, PictureFrame } from './archive-format';
import { ArchiveFailure, failure, permissionRequired, requireValue } from './errors';
import { createThumbnail, processPicture } from './pictures';
import { needsRelatedEventsTranslation, relatedEventGroups } from './related-events';
import type { PictureStage } from './pictures';
import { LoadingDiagnostics } from './loading-diagnostics';
import { PictureCache } from './picture-cache';

export interface MutationResult<T> {
  value: T;
  affectedPaths: string[];
  recoveryPaths: string[];
}
export interface ArchiveLoadProgress {
  phase: 'metadata' | 'enumerating' | 'reading' | 'complete';
  startedAt: number;
  elapsedMs: number;
  enumerationMs: number;
  readingMs: number;
  entries: number;
  total: number;
  read: number;
  unreadable: number;
  slowestBatchMs: number;
}
export interface ThumbnailProgress {
  total: number;
  processed: number;
  created: number;
  skipped: number;
  failures: { path: string; message: string }[];
}
export interface LabelDraft { title: string; picture?: string; picture_frame?: PictureFrame }
interface TextChange { path: string; source: string | null; next: string | null }

export const TRANSLATION_RECOVERY = 'limethat-related-events-recovery.json';

const encoder = new TextEncoder();
// Keep the BOM in the source snapshot so conflict checks and recovery copies preserve its bytes.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export class Archive {
  readonly diagnostics = new LoadingDiagnostics();
  private busy = false;

  readonly pictureCache: PictureCache;

  constructor(readonly root: FileSystemDirectoryHandle) {
    this.pictureCache = new PictureCache(root, (name, thumbnail) => this.readPicture(name, thumbnail), this.diagnostics);
  }

  get operating(): boolean { return this.busy; }

  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    requireValue(!this.busy, 'Another archive operation is running; wait before retrying.', 'busy');
    this.busy = true;
    try { return await action(); }
    catch (error) { throw failure(error); }
    finally { this.busy = false; }
  }

  private async location(path: string): Promise<{ directory: FileSystemDirectoryHandle; name: string }> {
    const parts = path.split('/');
    requireValue(parts.length <= 2 && parts.every(safeName), 'Invalid archive path');
    const name = parts.pop()!;
    const directory = parts.length ? await this.root.getDirectoryHandle(parts[0]) : this.root;
    return { directory, name };
  }

  private async read(path: string): Promise<string> {
    const { directory, name } = await this.location(path);
    return this.readFile(await directory.getFileHandle(name), path);
  }

  private async readFile(handle: FileSystemFileHandle, path: string, diagnose = false): Promise<string> {
    const file = await (diagnose ? this.diagnostics.measure('Text getFile', () => handle.getFile()) : handle.getFile());
    requireValue(file.size <= TEXT_LIMIT, `${path} exceeds 256 KB`, 'limit-exceeded');
    try {
      const bytes = await (diagnose ? this.diagnostics.measure('Text arrayBuffer', () => file.arrayBuffer()) : file.arrayBuffer());
      if (diagnose) this.diagnostics.record('Text file size', file.size, 'bytes');
      const start = performance.now();
      try { return decoder.decode(bytes); }
      finally { if (diagnose) this.diagnostics.record('Text UTF-8 decode', performance.now() - start); }
    }
    catch (cause) { throw new ArchiveFailure('invalid-data', `Cannot decode UTF-8: ${path}`, [path], [], { cause }); }
  }

  private async assertMissing(path: string): Promise<void> {
    const { directory, name } = await this.location(path);
    try { await directory.getFileHandle(name); }
    catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return;
      throw error;
    }
    throw new ArchiveFailure('conflict', `${path} already exists. Refresh before continuing.`, [path]);
  }

  private async assertSource(path: string, source: string | null): Promise<void> {
    if (source === null) return this.assertMissing(path);
    if (await this.read(path) !== source) {
      throw new ArchiveFailure('conflict', `${path} changed outside the app. Refresh before editing.`, [path]);
    }
  }

  private async write(path: string, data: string | Blob): Promise<void> {
    const { directory, name } = await this.location(path);
    const handle = await directory.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    try {
      await stream.write(data);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => {});
      throw error;
    }
    const expected = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(await data.arrayBuffer());
    const savedFile = await handle.getFile();
    requireValue(savedFile.size === expected.length, `Write verification failed: ${path}`, 'verification-failed');
    const saved = new Uint8Array(await savedFile.arrayBuffer());
    requireValue(saved.every((byte, index) => byte === expected[index]), `Write verification failed: ${path}`, 'verification-failed');
  }

  async hasTranslationRecovery(): Promise<boolean> {
    try { await this.root.getFileHandle(TRANSLATION_RECOVERY); return true; }
    catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return false;
      throw error;
    }
  }

  private async restoreTranslation(): Promise<MutationResult<void>> {
    const sourceRecord = await this.read(TRANSLATION_RECOVERY);
    if (!sourceRecord) {
      await this.root.removeEntry(TRANSLATION_RECOVERY);
      await this.assertMissing(TRANSLATION_RECOVERY);
      return { value: undefined, affectedPaths: [TRANSLATION_RECOVERY], recoveryPaths: [] };
    }
    const record = json(sourceRecord);
    requireValue(isObject(record) && String(record.version) === '1' && Array.isArray(record.files) && record.files.length > 0,
      'Invalid migration recovery record');
    const originals = new Map<string, string>();
    const recoveryPaths: string[] = [];
    for (const file of record.files) {
      requireValue(isObject(file) && typeof file.path === 'string' && typeof file.backup === 'string', 'Invalid recovery file');
      const path = file.path;
      requireValue(path === 'manifest.json' || path === 'tags.json' || /^moments\/[A-Za-z0-9._-]+\.md$/.test(path), 'Invalid recovery target');
      requireValue(!originals.has(path) && file.backup.startsWith(`${path}.backup-`) &&
        safeName(file.backup.slice(`${path}.backup-`.length)), 'Invalid recovery backup');
      const source = await this.read(file.backup);
      if (path === 'manifest.json') parseManifest(source);
      else if (path === 'tags.json') parseLabels(source);
      else parseEvent(path.slice('moments/'.length), source);
      originals.set(path, source);
      recoveryPaths.push(file.backup);
    }
    requireValue(originals.has('manifest.json') && originals.has('tags.json'), 'Incomplete migration recovery record');
    for (const [path, source] of originals) await this.write(path, source);
    await this.root.removeEntry(TRANSLATION_RECOVERY);
    await this.assertMissing(TRANSLATION_RECOVERY);
    return { value: undefined, affectedPaths: [...originals.keys(), TRANSLATION_RECOVERY], recoveryPaths };
  }

  async rollbackRelatedEvents(): Promise<MutationResult<void>> {
    return this.exclusive(() => this.restoreTranslation());
  }

  private async validateArchive(): Promise<void> {
    requireValue(!await this.hasTranslationRecovery(), 'Roll back the unfinished migration in Settings before editing.', 'conflict');
    parseManifest(await this.read('manifest.json'));
    parseLabels(await this.read('tags.json'));
    await this.root.getDirectoryHandle('moments');
    await this.root.getDirectoryHandle('attachments');
  }

  /** Applies text changes with verified sibling backups. This detects stale sources but cannot lock out other apps. */
  private async apply(changes: TextChange[], initializing = false, recoverTranslation = false): Promise<MutationResult<void>> {
    const recoveryPaths: string[] = [];
    const affectedPaths: string[] = [];
    const files: { path: string; backup: string }[] = [];
    let recoveryRecorded = false;
    let originalsAttempted = false;
    try {
      if (!initializing) await this.validateArchive();
      for (const change of changes) {
        if (change.next !== null) validateText(change.next);
        await this.assertSource(change.path, change.source);
      }
      for (const change of changes) {
        if (change.source === null) continue;
        const backup = `${change.path}.backup-${crypto.randomUUID()}`;
        await this.assertMissing(backup);
        affectedPaths.push(backup);
        await this.write(backup, change.source);
        recoveryPaths.push(backup);
        files.push({ path: change.path, backup });
        await this.assertSource(change.path, change.source);
      }
      if (recoverTranslation) {
        const record = serialize({ version: 1, files }, 2) + '\n';
        validateText(record);
        await this.assertMissing(TRANSLATION_RECOVERY);
        try { await this.write(TRANSLATION_RECOVERY, record); }
        catch (error) {
          await this.root.removeEntry(TRANSLATION_RECOVERY);
          throw error;
        }
        recoveryRecorded = true;
      }
      for (const change of changes) {
        await this.assertSource(change.path, change.source);
        affectedPaths.push(change.path);
        originalsAttempted = true;
        if (change.next === null) {
          const { directory, name } = await this.location(change.path);
          await directory.removeEntry(name);
          await this.assertMissing(change.path);
        } else {
          await this.write(change.path, change.next);
        }
      }
      if (recoveryRecorded) {
        await this.root.removeEntry(TRANSLATION_RECOVERY);
        await this.assertMissing(TRANSLATION_RECOVERY);
      }
      return { value: undefined, affectedPaths, recoveryPaths };
    } catch (error) {
      const cause = failure(error);
      if (recoveryRecorded) {
        try { await this.restoreTranslation(); }
        catch (rollbackError) {
          throw new ArchiveFailure('partial-change', `${cause.message} Automatic rollback could not finish: ${failure(rollbackError).message}. Use Roll back unfinished migration in Settings.`,
            affectedPaths, recoveryPaths, { cause: rollbackError });
        }
        throw new ArchiveFailure(cause.code === 'partial-change' ? 'io-error' : cause.code,
          `${cause.message} Migration rolled back. Refresh the archive before retrying.`, affectedPaths, [], { cause });
      }
      throw new ArchiveFailure(originalsAttempted ? 'partial-change' : cause.code,
        `${cause.message} ${originalsAttempted ? 'Some changes may be complete. Do not blindly retry; refresh and inspect affected files.' : 'This operation did not change original files.'}`,
        [...new Set([...affectedPaths, ...cause.affectedPaths])], recoveryPaths, { cause });
    }
  }

  async initialize(): Promise<MutationResult<void>> {
    return this.exclusive(async () => {
      for await (const _entry of this.root.values()) {
        throw new ArchiveFailure('conflict', 'Choose an empty folder. Existing files were not changed.');
      }
      const paths: string[] = [];
      try {
        for (const name of ['moments', 'attachments']) {
          paths.push(name);
          await this.root.getDirectoryHandle(name, { create: true });
        }
        const result = await this.apply([
          { path: 'tags.json', source: null, next: '[]\n' },
          { path: 'manifest.json', source: null, next: serialize({
            format_version: 1, created_at: new Date().toISOString(), moments: 0, attachments: 0,
            skipped_media: [], external_links: [], files: {},
          }, 2) + '\n' },
        ], true);
        return { ...result, affectedPaths: [...paths, ...result.affectedPaths] };
      } catch (cause) {
        const error = failure(cause);
        throw new ArchiveFailure('partial-change', `Archive setup stopped: ${error.message} New files or directories may remain; inspect this folder or choose another empty folder.`,
          [...paths, ...error.affectedPaths], error.recoveryPaths, { cause });
      }
    });
  }

  private async readArchive(onprogress?: (progress: ArchiveLoadProgress) => void): Promise<ArchiveSummary> {
    const startedAt = performance.now();
    const progress: ArchiveLoadProgress = { phase: 'metadata', startedAt, elapsedMs: 0, enumerationMs: 0, readingMs: 0, entries: 0, total: 0, read: 0, unreadable: 0, slowestBatchMs: 0 };
    const report = () => onprogress?.({ ...progress, elapsedMs: performance.now() - startedAt });
    report();
    const manifest = parseManifest(await this.read('manifest.json'));
    const tagsSource = await this.read('tags.json');
    const labels = parseLabels(tagsSource);
    const directory = await this.root.getDirectoryHandle('moments');
    await this.root.getDirectoryHandle('attachments');
    const events: ArchiveEvent[] = [];
    const unreadableEvents: ArchiveSummary['unreadableEvents'] = [];
    const warnings = ['Manifest counts and hashes describe the original export, not current integrity.'];
    if (Array.isArray(manifest.skipped_media) && manifest.skipped_media.length) warnings.push('Some pictures were omitted from the original export.');
    const ids = new Set<string>();
    const handles: FileSystemFileHandle[] = [];
    progress.phase = 'enumerating';
    report();
    const enumerationStart = performance.now();
    for await (const entry of directory.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) handles.push(entry);
      progress.entries++;
      progress.total = handles.length;
      progress.enumerationMs = performance.now() - enumerationStart;
      if (progress.entries % 32 === 0) report();
    }
    progress.enumerationMs = performance.now() - enumerationStart;
    progress.phase = 'reading';
    report();
    const readingStart = performance.now();
    for (let index = 0; index < handles.length; index += 8) {
      const batchStart = performance.now();
      const batch = await Promise.all(handles.slice(index, index + 8).map(async handle => {
        const name = handle.name;
        const path = `moments/${name}`;
        try {
          requireValue(safeName(name), 'Invalid archive path');
          const source = await this.readFile(handle, path, true);
          const parseStart = performance.now();
          try { return { path, event: parseEvent(name, source) }; }
          finally { this.diagnostics.record('Text parseEvent', performance.now() - parseStart); }
        }
        catch (error) { return { path, error: failure(error).message }; }
        finally {
          progress.read++;
          progress.readingMs = performance.now() - readingStart;
          report();
        }
      }));
      for (const result of batch) {
        try {
          if (!result.event) throw new Error(result.error);
          const event = result.event;
          requireValue(!ids.has(event.id.toLowerCase()), `Duplicate event UUID: ${event.id}`);
          ids.add(event.id.toLowerCase());
          events.push(event);
        } catch (error) { unreadableEvents.push({ path: result.path, message: failure(error).message }); }
      }
      progress.unreadable = unreadableEvents.length;
      progress.readingMs = performance.now() - readingStart;
      progress.slowestBatchMs = Math.max(progress.slowestBatchMs, performance.now() - batchStart);
      report();
    }
    events.sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '') || b.created.localeCompare(a.created));
    progress.phase = 'complete';
    report();
    return { manifest, tagsSource, labels, events, unreadableEvents, warnings };
  }

  async load(onprogress?: (progress: ArchiveLoadProgress) => void): Promise<ArchiveSummary> { return this.exclusive(() => this.readArchive(onprogress)); }
  async refresh(): Promise<ArchiveSummary> { return this.load(); }

  async createEvent(draft: EventDraft): Promise<MutationResult<ArchiveEvent>> {
    return this.exclusive(async () => {
      const event = newEvent();
      const text = editEvent(event, draft);
      const result = await this.apply([{ path: `moments/${event.filename}`, source: null, next: text }]);
      return { ...result, value: parseEvent(event.filename, text) };
    });
  }

  async updateEvent(original: ArchiveEvent, draft: EventDraft): Promise<MutationResult<ArchiveEvent>> {
    return this.exclusive(async () => {
      const snapshot = parseEvent(original.filename, original.source);
      const text = editEvent(snapshot, draft);
      const result = await this.apply([{ path: `moments/${snapshot.filename}`, source: snapshot.source, next: text }]);
      return { ...result, value: parseEvent(snapshot.filename, text) };
    });
  }

  async deleteEvent(original: ArchiveEvent): Promise<MutationResult<void>> {
    return this.exclusive(() => {
      const event = parseEvent(original.filename, original.source);
      return this.apply([{ path: `moments/${event.filename}`, source: event.source, next: null }]);
    });
  }

  async createLabel(snapshot: ArchiveSummary, draft: LabelDraft): Promise<MutationResult<Label>> {
    return this.changeLabel(snapshot, null, draft) as Promise<MutationResult<Label>>;
  }

  async updateLabel(snapshot: ArchiveSummary, id: string, draft: LabelDraft): Promise<MutationResult<Label>> {
    return this.changeLabel(snapshot, id, draft) as Promise<MutationResult<Label>>;
  }

  async deleteLabel(snapshot: ArchiveSummary, id: string): Promise<MutationResult<null>> {
    return this.changeLabel(snapshot, id, null) as Promise<MutationResult<null>>;
  }

  private async changeLabel(snapshot: ArchiveSummary, id: string | null, draft: LabelDraft | null): Promise<MutationResult<Label | null>> {
    return this.exclusive(async () => {
      const labels = parseLabels(snapshot.tagsSource);
      await this.assertSource('tags.json', snapshot.tagsSource);
      const existing = id === null ? undefined : labels.find(label => labelKey(label.id) === id);
      requireValue(id === null || existing, 'Label no longer exists. Refresh first.', 'conflict');
      let replacement: Label | null = null;
      if (draft) {
        requireValue(typeof draft.title === 'string' && draft.title.trim(), 'Enter a label name');
        replacement = { ...(existing ?? { id: nextLabelId(labels), created: new Date().toISOString() }),
          title: draft.title.trim(), modified: new Date().toISOString() };
        delete replacement.picture;
        delete replacement.picture_frame;
        if (draft.picture !== undefined) replacement.picture = draft.picture;
        if (draft.picture_frame !== undefined) {
          requireValue(draft.picture !== undefined, 'A label frame needs a picture');
          replacement.picture_frame = validateFrame(draft.picture_frame);
        }
      } else { requireValue(existing, 'Choose an existing label to delete'); }
      const nextLabels = existing ? labels.flatMap(label => labelKey(label.id) === id ? replacement ? [replacement] : [] : [label]) : [...labels, replacement!];
      const tagsText = serialize(nextLabels, 2) + '\n';
      parseLabels(tagsText);
      const changes: TextChange[] = [];
      if (existing && (!replacement || replacement.title !== existing.title)) {
        requireValue(snapshot.unreadableEvents.length === 0, 'Resolve unreadable events before changing labels');
        const current = await this.readArchive();
        requireValue(current.unreadableEvents.length === 0, 'Resolve unreadable events before changing labels');
        const originalEvents = new Map(snapshot.events.map(event => [event.filename, event]));
        requireValue(current.events.length === originalEvents.size && current.events.every(event =>
          originalEvents.get(event.filename)?.source === event.source), 'Events changed outside the app. Refresh before changing labels.', 'conflict');
        for (const event of current.events) {
          if (!event.tags.some(tag => tag.id === id)) continue;
          const tags = event.tags.flatMap(tag => tag.id !== id ? [tag] : replacement ? [{ ...tag, title: replacement.title }] : []);
          changes.push({ path: `moments/${event.filename}`, source: event.source, next: updateMetadata(event, { tags }) });
        }
      }
      changes.push({ path: 'tags.json', source: snapshot.tagsSource, next: tagsText });
      const result = await this.apply(changes);
      return { ...result, value: replacement };
    });
  }

  async translateRelatedEvents(snapshot: ArchiveSummary): Promise<MutationResult<void>> {
    return this.exclusive(async () => {
      requireValue(needsRelatedEventsTranslation(snapshot), 'No related events need translation');
      requireValue(snapshot.unreadableEvents.length === 0, 'Resolve unreadable events before translating related events');
      const current = await this.readArchive();
      const originals = new Map(snapshot.events.map(event => [event.filename, event.source]));
      requireValue(current.unreadableEvents.length === 0 && current.events.length === originals.size &&
        current.events.every(event => originals.get(event.filename) === event.source) &&
        current.tagsSource === snapshot.tagsSource && serialize(current.manifest) === serialize(snapshot.manifest),
      'Archive changed outside the app. Refresh before translating related events.', 'conflict');
      const manifestSource = await this.read('manifest.json');
      requireValue(serialize(parseManifest(manifestSource)) === serialize(current.manifest),
        'Manifest changed outside the app. Refresh first.', 'conflict');
      const labels = parseLabels(current.tagsSource);
      const changes: TextChange[] = [];
      const completedAt = new Date().toISOString();
      for (const group of relatedEventGroups(current.events)) {
        const base = `Related: ${group[0].title}`;
        let title = base;
        let suffix = 2;
        while (labels.some(label => label.title === title)) title = `${base} (${suffix++})`;
        const label: Label = { id: nextLabelId(labels), title, created: completedAt, modified: completedAt };
        labels.push(label);
        for (const event of group) changes.push({ path: `moments/${event.filename}`, source: event.source,
          next: updateMetadata(event, { tags: [...event.tags, { id: labelKey(label.id), title }] }) });
      }
      const web = current.manifest.limethat_web;
      requireValue(web === undefined || isObject(web), 'Invalid limethat_web metadata');
      const migrations = web?.migrations;
      requireValue(migrations === undefined || isObject(migrations), 'Invalid limethat_web migrations metadata');
      const manifest = { ...current.manifest, limethat_web: { ...web, migrations: { ...migrations,
        related_events_to_tags: { completed_at: completedAt },
      } } };
      const tagsText = serialize(labels, 2) + '\n';
      parseLabels(tagsText);
      changes.unshift({ path: 'tags.json', source: current.tagsSource, next: tagsText });
      changes.push({ path: 'manifest.json', source: manifestSource, next: serialize(manifest, 2) + '\n' });
      return this.apply(changes, false, true);
    });
  }

  async readPicture(name: string, thumbnail = true): Promise<File> {
    requireValue(safeName(name), 'Invalid picture name');
    try {
      const directory = await this.diagnostics.measure('Picture directory lookup', () => this.root.getDirectoryHandle('attachments'));
      let handle: FileSystemFileHandle;
      let usedThumbnail = thumbnail;
      try {
        handle = await this.diagnostics.measure('Picture file lookup', () => directory.getFileHandle(thumbnail ? `${name}.thumb.jpg` : name));
        if (thumbnail) this.diagnostics.increment('Thumbnails found');
      }
      catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'NotFoundError' || !thumbnail) throw error;
        this.diagnostics.increment('Missing thumbnails (original fallback attempted)');
        usedThumbnail = false;
        handle = await this.diagnostics.measure('Picture fallback lookup', () => directory.getFileHandle(name));
      }
      const file = await this.diagnostics.measure('Picture getFile', () => handle.getFile());
      requireValue(file.size <= PICTURE_LIMIT, 'Picture exceeds 25 MB', 'limit-exceeded');
      this.diagnostics.record(usedThumbnail ? 'Thumbnail size' : 'Original picture size', file.size, 'bytes');
      return file;
    } catch (error) { throw failure(error); }
  }

  async createMissingThumbnails(onprogress: (progress: ThumbnailProgress) => void): Promise<void> {
    return this.exclusive(async () => {
      await this.validateArchive();
      const directory = await this.root.getDirectoryHandle('attachments');
      const originals: FileSystemFileHandle[] = [];
      const names = new Set<string>();
      for await (const entry of directory.values()) {
        names.add(entry.name);
        if (entry.kind === 'file' && safeName(entry.name) && /\.(jpe?g|png|webp|avif|gif|bmp|heic)$/i.test(entry.name) && !entry.name.endsWith('.thumb.jpg')) originals.push(entry);
      }
      const progress: ThumbnailProgress = { total: originals.length, processed: 0, created: 0, skipped: 0, failures: [] };
      const report = () => onprogress({ ...progress, failures: [...progress.failures] });
      report();
      for (const original of originals) {
        const target = `${original.name}.thumb.jpg`;
        const path = `attachments/${target}`;
        if (names.has(target)) {
          progress.skipped++;
        } else {
          let attempted = false;
          try {
            const source = await original.getFile();
            const thumbnail = await createThumbnail(source);
            const current = await original.getFile();
            requireValue(current.size === source.size && current.lastModified === source.lastModified, 'Original picture changed during thumbnail creation.', 'conflict');
            await this.assertMissing(path);
            attempted = true;
            await this.write(path, thumbnail);
            progress.created++;
            this.pictureCache.invalidate();
          } catch (error) {
            let message = failure(error).message;
            if (attempted) {
              try { await directory.removeEntry(target); }
              catch { message += ' An incomplete thumbnail may remain; remove it before retrying.'; }
            }
            progress.failures.push({ path, message });
            if (permissionRequired(error)) { progress.processed++; report(); throw error; }
          }
        }
        progress.processed++;
        report();
      }
    });
  }

  async importPicture(file: Blob, progress?: (stage: PictureStage) => void): Promise<MutationResult<string>> {
    return this.exclusive(async () => {
      await this.validateArchive();
      const { image, thumbnail } = await processPicture(file, progress);
      progress?.('writing');
      const name = `${crypto.randomUUID()}.jpg`;
      const affectedPaths: string[] = [];
      try {
        for (const [filename, blob] of [[name, image], [`${name}.thumb.jpg`, thumbnail]] as const) {
          const path = `attachments/${filename}`;
          await this.assertMissing(path);
          affectedPaths.push(path);
          await this.write(path, blob);
        }
        return { value: name, affectedPaths, recoveryPaths: [] };
      } catch (cause) {
        throw new ArchiveFailure('partial-change', `Picture import stopped: ${failure(cause).message} Partial attachments may remain; inspect affected files before retrying. No attachments were deleted.`, affectedPaths, [], { cause });
      }
    });
  }
}
