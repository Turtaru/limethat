import { Archive } from './archive';
import type { ArchiveLoadProgress, LabelDraft, MutationResult, ThumbnailProgress } from './archive';
import type { ArchiveEvent, ArchiveSummary, EventDraft } from './archive-format';
import { ArchiveFailure, failure, permissionRequired } from './errors';
import { chooseFolder, folderCapability, folderPermission, forgetFolder, rememberFolder, requestFolderPermission, restoreFolder } from './folder-access';
import type { PictureStage } from './pictures';
import type { LoadingDiagnostics } from './loading-diagnostics';
import { clearPictureCache } from './picture-cache';
import { clearEventSnapshots } from './event-snapshot';

export type WorkspaceState = 'unsupported' | 'no-folder' | 'permission-required' | 'loading' | 'ready' | 'error';
export type MutationOutcome<T> =
  | { status: 'saved'; result: MutationResult<T>; refresh: 'ready' }
  | { status: 'saved'; result: MutationResult<T>; refresh: 'failed'; refreshError: ArchiveFailure }
  | { status: 'failed'; error: ArchiveFailure };

/** Holds folder snapshots and operation status. Cached/partial snapshots are read-only until folder verification completes; views own drafts and navigation. */
export class Workspace {
  readonly capability = folderCapability();
  state = $state<WorkspaceState>(this.capability.supported ? 'no-folder' : 'unsupported');
  archive = $state.raw<Archive | null>(null);
  summary = $state.raw<ArchiveSummary | null>(null);
  translationRecovery = $state(false);
  permission = $state<PermissionState>('prompt');
  operation = $state<string | null>(null);
  error = $state.raw<ArchiveFailure | null>(null);
  persistenceWarning = $state<string | null>(null);
  loadProgress = $state.raw<ArchiveLoadProgress | null>(null);
  diagnostics = $state.raw<LoadingDiagnostics | null>(null);
  thumbnailProgress = $state.raw<ThumbnailProgress | null>(null);
  pictureCacheWarning = $state('');
  snapshotStatus = $state<'cached' | 'building' | null>(null);
  snapshotSavedAt = $state<number | null>(null);
  snapshotWarning = $state('');
  private pending: { handle: FileSystemDirectoryHandle; create: boolean } | null = null;

  private start(operation: string): void {
    if (this.operation || this.archive?.operating) throw new ArchiveFailure('busy', 'Another workspace operation is running; wait before retrying.');
    this.operation = operation;
    this.error = null;
    if (['opening', 'creating', 'restoring', 'reconnecting', 'closing'].includes(operation)) this.loadProgress = null;
  }

  private failed(error: unknown): ArchiveFailure {
    const problem = failure(error);
    this.error = problem;
    const needsPermission = permissionRequired(problem);
    this.state = needsPermission ? 'permission-required'
      : problem.code === 'unsupported' ? 'unsupported' : 'error';
    if (needsPermission) this.permission = 'denied';
    return problem;
  }

  private async connect(handle: FileSystemDirectoryHandle, create = false): Promise<void> {
    const permission = await folderPermission(handle);
    if (permission !== 'granted') {
      this.pending = { handle, create };
      this.permission = permission;
      this.state = 'permission-required';
      return;
    }
    this.state = 'loading';
    const candidate = new Archive(handle);
    this.diagnostics = candidate.diagnostics;
    this.thumbnailProgress = null;
    this.pictureCacheWarning = '';
    this.snapshotStatus = null;
    this.snapshotSavedAt = null;
    this.snapshotWarning = '';
    const setup = create ? await candidate.initialize() : null;
    const translationRecovery = await candidate.hasTranslationRecovery();
    let cached = null;
    if (!translationRecovery && !create) {
      try { cached = await candidate.eventCache.read(); }
      catch { this.snapshotWarning = 'Cached events unavailable; rebuilding from the archive folder.'; }
    }
    const preview = (summary: ArchiveSummary, status: 'cached' | 'building') => {
      this.archive = candidate;
      this.summary = summary;
      this.translationRecovery = false;
      this.pending = null;
      this.permission = 'granted';
      this.snapshotStatus = status;
      this.state = 'ready';
    };
    if (cached) {
      this.snapshotSavedAt = cached.savedAt;
      candidate.diagnostics.increment('Event snapshot cache hits');
      preview(cached.summary, 'cached');
    } else if (!translationRecovery) candidate.diagnostics.increment('Event snapshot cache misses');
    let summary: ArchiveSummary | null;
    try {
      summary = translationRecovery ? null : await candidate.load(progress => { this.loadProgress = progress; },
        cached ? undefined : partial => { preview(partial, 'building'); }, cached ?? undefined);
    }
    catch (cause) {
      if (setup) throw new ArchiveFailure('partial-change', 'Archive creation completed, but opening it failed. Reopen this folder; do not repeat creation.', setup.affectedPaths, [], { cause });
      throw cause;
    }
    // Cached/partial data may already be visible, but opening blocks edits until the folder check finishes.
    this.archive = candidate;
    this.summary = summary;
    this.translationRecovery = translationRecovery;
    this.pending = null;
    this.permission = 'granted';
    this.state = translationRecovery ? 'error' : 'ready';
    this.snapshotStatus = null;
    if (summary) await this.persistSnapshot();
    if (translationRecovery) this.error = new ArchiveFailure('conflict', 'An unfinished migration needs rollback in Settings.');
    try {
      await rememberFolder(handle);
      this.persistenceWarning = null;
    } catch (error) {
      this.persistenceWarning = `Archive opened, but its handle could not be remembered: ${failure(error).message}`;
    }
  }

  async choose(create = false): Promise<void> {
    this.start(create ? 'creating' : 'opening');
    const previousState = this.state;
    try {
      const picker = chooseFolder();
      const handle = await picker;
      await this.connect(handle, create);
    } catch (error) {
      if (failure(error).code === 'cancelled') this.state = previousState;
      else this.failed(error);
    } finally { this.operation = null; }
  }

  async restore(): Promise<void> {
    this.start('restoring');
    try {
      if (!this.capability.supported) { this.state = 'unsupported'; return; }
      const handle = await restoreFolder();
      if (handle) await this.connect(handle);
      else this.state = this.archive ? 'ready' : 'no-folder';
    } catch (error) { this.failed(error); }
    finally { this.operation = null; }
  }

  async reconnect(): Promise<void> {
    this.start('reconnecting');
    try {
      const target = this.pending ?? (this.archive ? { handle: this.archive.root, create: false } : null);
      if (!target) throw new ArchiveFailure('unavailable', 'Choose an archive folder first.');
      const prompt = requestFolderPermission(target.handle);
      this.permission = await prompt;
      if (this.permission !== 'granted') {
        this.state = 'permission-required';
        this.error = new ArchiveFailure('permission-required', 'Read/write access was not granted. Reconnect or choose the folder again.');
        return;
      }
      await this.connect(target.handle, target.create);
    } catch (error) { this.failed(error); }
    finally { this.operation = null; }
  }

  async disconnect(): Promise<void> {
    this.start('closing');
    try {
      await forgetFolder();
      this.archive = null;
      this.diagnostics = null;
      this.thumbnailProgress = null;
      this.pictureCacheWarning = '';
      this.snapshotStatus = null;
      this.snapshotSavedAt = null;
      this.snapshotWarning = '';
      this.summary = null;
      this.translationRecovery = false;
      this.pending = null;
      this.permission = 'prompt';
      this.persistenceWarning = null;
      this.state = this.capability.supported ? 'no-folder' : 'unsupported';
    } catch (error) { this.failed(error); }
    finally { this.operation = null; }
  }

  async refresh(): Promise<void> {
    this.start('refreshing');
    try {
      if (!this.archive) throw new ArchiveFailure('unavailable', 'Choose an archive folder first.');
      this.translationRecovery = await this.archive.hasTranslationRecovery();
      if (this.translationRecovery) {
        this.summary = null;
        throw new ArchiveFailure('conflict', 'An unfinished migration needs rollback in Settings.');
      }
      this.summary = await this.archive.refresh();
      this.snapshotStatus = null;
      await this.persistSnapshot();
      this.state = 'ready';
      this.permission = 'granted';
    } catch (error) { this.failed(error); }
    finally { this.operation = null; }
  }

  private async mutate<T>(name: string, action: (archive: Archive, summary: ArchiveSummary) => Promise<MutationResult<T>>, recovery = false): Promise<MutationOutcome<T>> {
    this.start(name);
    try {
      if (!this.archive || (!this.summary && !recovery)) throw new ArchiveFailure('unavailable', 'Choose an archive folder first.');
      if (this.snapshotStatus && !recovery) throw new ArchiveFailure('busy', 'Wait for archive verification before editing cached or incomplete events.');
      if (this.translationRecovery && !recovery) throw new ArchiveFailure('conflict', 'Roll back the unfinished migration in Settings before editing.');
      if (this.pending) throw new ArchiveFailure('permission-required', 'Reconnect or reopen a folder before editing.');
      const result = await action(this.archive, this.summary!);
      this.translationRecovery = await this.archive.hasTranslationRecovery();
      try {
        this.summary = await this.archive.refresh();
        this.snapshotStatus = null;
        await this.persistSnapshot();
        this.state = 'ready';
        this.permission = 'granted';
        return { status: 'saved', result, refresh: 'ready' };
      } catch (error) {
        return { status: 'saved', result, refresh: 'failed', refreshError: this.failed(error) };
      }
    } catch (error) {
      if (this.archive) {
        try { this.translationRecovery = await this.archive.hasTranslationRecovery(); }
        catch {}
      }
      return { status: 'failed', error: this.failed(error) };
    }
    finally { this.operation = null; }
  }

  rollbackRelatedEvents() { return this.mutate('rolling back migration', archive => archive.rollbackRelatedEvents(), true); }
  translateRelatedEvents() { return this.mutate('translating related events', (archive, summary) => archive.translateRelatedEvents(summary)); }
  createEvent(draft: EventDraft) { return this.mutate('saving', archive => archive.createEvent(draft)); }
  updateEvent(original: ArchiveEvent, draft: EventDraft) { return this.mutate('saving', archive => archive.updateEvent(original, draft)); }
  deleteEvent(original: ArchiveEvent) { return this.mutate('deleting', archive => archive.deleteEvent(original)); }
  createLabel(draft: LabelDraft) { return this.mutate('saving', (archive, summary) => archive.createLabel(summary, draft)); }
  updateLabel(id: string, draft: LabelDraft) { return this.mutate('saving', (archive, summary) => archive.updateLabel(summary, id, draft)); }
  deleteLabel(id: string) { return this.mutate('deleting', (archive, summary) => archive.deleteLabel(summary, id)); }
  importPicture(file: Blob) {
    return this.mutate('decoding', archive => archive.importPicture(file, (stage: PictureStage) => { this.operation = stage; }));
  }
  async createMissingThumbnails(): Promise<void> {
    if (this.state !== 'ready' || this.translationRecovery || this.pending) throw new ArchiveFailure('unavailable', 'Reconnect the archive before creating thumbnails.');
    this.start('creating thumbnails');
    this.thumbnailProgress = null;
    try {
      if (!this.archive) throw new ArchiveFailure('unavailable', 'Choose an archive folder first.');
      await this.archive.createMissingThumbnails(progress => { this.thumbnailProgress = progress; });
    } catch (error) { this.failed(error); }
    finally { this.operation = null; }
  }

  private async persistSnapshot(): Promise<void> {
    if (!this.archive || !this.summary || this.snapshotStatus) return;
    try {
      await this.archive.eventCache.save(this.summary, this.archive.eventFileStamps);
      this.snapshotSavedAt = Date.now();
      this.snapshotWarning = '';
      this.archive.diagnostics.increment('Event snapshots saved');
    } catch { this.snapshotWarning = 'Event cache could not be saved. Browsing still works; the next opening may need to rebuild.'; }
  }

  async clearEventCache(): Promise<void> {
    this.start('clearing event cache');
    try { await clearEventSnapshots(); this.snapshotSavedAt = null; this.snapshotWarning = ''; }
    catch { this.snapshotWarning = 'Could not clear cached events. Close other tabs and retry.'; }
    finally { this.operation = null; }
  }

  async clearPictureCache(): Promise<void> {
    this.start('clearing picture cache');
    try { await clearPictureCache(); this.pictureCacheWarning = ''; }
    catch { this.pictureCacheWarning = 'Could not clear the picture cache. Try closing other tabs and retrying.'; }
    finally { this.operation = null; }
  }

  async cachedPicture(name: string, thumbnail = true) {
    const archive = this.archive;
    if (!archive) throw new ArchiveFailure('unavailable', 'Choose an archive folder first.');
    try {
      const result = await archive.pictureCache.load(name, thumbnail);
      if (this.archive === archive && archive.pictureCache.warning) this.pictureCacheWarning = archive.pictureCache.warning;
      if (result.refresh) result.refresh = result.refresh.then(file => {
        if (this.archive === archive && archive.pictureCache.warning) this.pictureCacheWarning = archive.pictureCache.warning;
        return file;
      }).catch(() => {
        if (this.archive === archive) this.pictureCacheWarning = 'A cached picture could not be checked against the folder. Reconnect or refresh the archive; the cached view may be outdated.';
        return null;
      });
      return result;
    } catch (error) { throw permissionRequired(error) ? this.failed(error) : failure(error); }
  }

  async readPicture(name: string, thumbnail = true): Promise<File> {
    if (!this.archive) throw new ArchiveFailure('unavailable', 'Choose an archive folder first.');
    try { return await this.archive.readPicture(name, thumbnail); }
    catch (error) { throw permissionRequired(error) ? this.failed(error) : failure(error); }
  }
}
