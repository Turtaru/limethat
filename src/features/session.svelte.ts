import { getContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { push } from 'svelte-spa-router';
import { Workspace } from '../lib/workspace.svelte';
import type { MutationOutcome } from '../lib/workspace.svelte';
import type { ArchiveEvent, Label, PictureFrame } from '../lib/archive-format';
import { ArchiveFailure } from '../lib/errors';
import { pwa } from './pwa.svelte';
import { editorInitial, eventDraft, eventHref, labelHref } from './models';
import { labelKey, updateMetadata, validateDate } from '../lib/archive-format';
import type { EventDraft, LabelEditorDraft } from '../lib/ui-kit/types';
import { containedFrame } from '../lib/images/image-frame';
import { processPicture } from '../lib/pictures';
import { ListNavigation } from './list-navigation';
import type { ActivityLevel } from '../lib/system-activity.svelte';

export const sessionKey = Symbol('limethat');
export const useSession = () => getContext<Session>(sessionKey);

export class Session {
  workspace = new Workspace();
  readonly navigation = new ListNavigation();
  private lastNotice = $state('');
  get activity() { return this.workspace.activity; }
  get notice() { return this.lastNotice; }
  set notice(message: string) { this.notify(message); }
  notify(message: string, level: ActivityLevel = 'info') {
    this.lastNotice = message;
    if (message) this.activity.add(message, level);
  }
  theme = $state<'dark' | 'light'>('dark');
  reviewRequired = $state(false);
  savedRefreshError = $state.raw<ArchiveFailure | null>(null);
  get draftCount() {
    return [...this.eventDrafts, ...this.labelDrafts].filter(([key, draft]) => draft.dirty || this.pendingSaves.has(key) || this.saveErrors.has(key)).length;
  }
  readonly eventDrafts = new SvelteMap<string, EventPageDraft>();
  readonly labelDrafts = new SvelteMap<string, LabelPageDraft>();
  readonly pendingSaves = new SvelteMap<string, { title: string; eventIds: string[]; labelId?: string; rewritesEvents?: boolean }>();
  readonly saveErrors = new SvelteMap<string, string>();
  private saveTail: Promise<void> = Promise.resolve();
  private eventRebases = new Map<string, ArchiveEvent>();
  viewer = $state<{ name: string; alt: string; section?: 'events' | 'labels' } | null>(null);
  get canEdit() { return this.workspace.state === 'ready' && !this.workspace.snapshotStatus && !this.workspace.translationRecovery && (!this.workspace.operation || this.pendingSaves.size > 0) && !this.reviewRequired && !pwa.activating; }
  get canWrite() { return this.canEdit && !this.workspace.operation && !this.pendingSaves.size; }
  eventSaving(id: string) {
    const event = this.workspace.summary?.events.find(event => event.id.toLowerCase() === id.toLowerCase());
    return [...this.pendingSaves.values()].some(save => save.eventIds.includes(id.toLowerCase()) || (save.rewritesEvents && event?.tags.some(tag => tag.id === save.labelId)));
  }
  labelSaving(id: string) { return [...this.pendingSaves.values()].some(save => save.labelId === id); }
  editEvent(event: ArchiveEvent | null) { if (this.canEdit && (!event || !this.eventSaving(event.id))) void push(event ? `${eventHref(event.id)}/edit` : '/events/new'); }
  editLabel(label: Label | null) { if (this.canEdit && (!label || !this.labelSaving(labelKey(label.id)))) void push(label ? `${labelHref(labelKey(label.id))}/edit` : '/labels/new'); }

  /** Owns in-memory save jobs across route changes; one job includes its picture imports and verified record write. */
  private enqueueSave(key: string, page: EventPageDraft | LabelPageDraft, pending: { title: string; eventIds: string[]; labelId?: string; rewritesEvents?: boolean }, save: () => Promise<void>) {
    this.saveErrors.delete(key);
    this.pendingSaves.set(key, pending);
    const activityId = this.activity.add(`Saving ${pending.title}`, 'info', 'running');
    this.saveTail = this.saveTail.then(async () => {
      let started = false;
      try {
        if (!this.canEdit || page.blocked) throw new Error('Reconnect or refresh before saving.');
        started = true;
        await save();
        this.discardDraft(key);
        this.activity.finish(activityId);
      } catch (cause) {
        if (started && this.reviewRequired) page.blocked = true;
        const message = cause instanceof Error ? cause.message : 'Could not save changes.';
        this.saveErrors.set(key, message);
        this.activity.finish(activityId, message);
      } finally { this.pendingSaves.delete(key); }
    });
  }

  saveEvent(key: string, page: EventPageDraft, value: EventDraft) {
    if (!this.canEdit || page.blocked || this.pendingSaves.has(key) || (page.original && this.eventSaving(page.original.id))) throw new Error('Reconnect or wait for this event to finish saving.');
    const fieldErrors: Record<string, string> = {};
    for (const [field, date] of [['date', value.date], ['endDate', value.endDate]]) {
      try {
        if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Incomplete date');
        validateDate(date || null);
      } catch { fieldErrors[field] = 'Enter a valid YYYY-MM-DD date.'; }
    }
    if (Object.keys(fieldErrors).length) throw Object.assign(new Error('Check the date fields.'), { fieldErrors });
    const draft = { ...value, labelIds: [...value.labelIds], pictures: [...value.pictures], removedPictureIds: [...value.removedPictureIds] };
    const frames = $state.snapshot(page.frames);
    const pictureFrames = draft.pictures.map(file => ({ ...page.pictures.frame(file) }));
    this.enqueueSave(key, page, { title: `Event: ${draft.title}`, eventIds: page.original ? [page.original.id.toLowerCase()] : [] }, async () => {
      const imported: string[] = [];
      for (const file of draft.pictures) imported.push(await page.pictures.import(file));
      const summary = this.workspace.summary!;
      // Rebase only our label rewrites; external changes must still fail the archive's source comparison.
      const original = page.original ? this.eventRebases.get(page.original.source) ?? page.original : null;
      if (original && !summary.events.some(event => event.id.toLowerCase() === original!.id.toLowerCase())) throw new Error('Event no longer exists. Refresh before saving.');
      const complete = eventDraft(draft, original ?? null, summary, imported);
      complete.frames = frames;
      imported.forEach((name, index) => { complete.frames![name] = pictureFrames[index]; });
      this.result(await (original ? this.workspace.updateEvent(original, complete) : this.workspace.createEvent(complete)));
    });
  }

  saveLabel(key: string, page: LabelPageDraft, value: LabelEditorDraft) {
    const id = page.original ? labelKey(page.original.id) : undefined;
    if (!this.canEdit || page.blocked || this.pendingSaves.has(key) || (id !== undefined && this.labelSaving(id))) throw new Error('Reconnect or wait for this label to finish saving.');
    const draft = { ...value };
    const frame = page.frame ? { ...page.frame } : undefined;
    const pictureFrame = draft.picture ? { ...page.pictures.frame(draft.picture) } : undefined;
    const eventIds = id !== undefined && draft.name !== page.original!.title
      ? this.workspace.summary!.events.filter(event => event.tags.some(tag => tag.id === id)).map(event => event.id.toLowerCase()) : [];
    this.enqueueSave(key, page, { title: `Label: ${draft.name}`, eventIds, labelId: id, rewritesEvents: id !== undefined && draft.name !== page.original!.title }, async () => {
      const imported = draft.picture ? await page.pictures.import(draft.picture) : null;
      const original = id === undefined ? null : this.workspace.summary!.labels.find(label => labelKey(label.id) === id);
      if (id !== undefined && !original) throw new Error('Label no longer exists. Refresh before saving.');
      const picture = imported ? `attachments/${imported}` : draft.removePicture ? undefined : original?.picture;
      const complete = { title: draft.name, picture, picture_frame: imported ? pictureFrame : draft.removePicture ? undefined : frame };
      const before = this.workspace.summary!;
      const outcome = await (id !== undefined ? this.workspace.updateLabel(id, complete) : this.workspace.createLabel(complete));
      this.result(outcome);
      if (id !== undefined && original?.title !== draft.name && outcome.status === 'saved' && outcome.refresh === 'ready') {
        for (const event of before.events.filter(event => event.tags.some(tag => tag.id === id))) {
          const updated = this.workspace.summary!.events.find(item => item.id === event.id);
          const tags = event.tags.map(tag => tag.id === id ? { ...tag, title: draft.name.trim() } : tag);
          if (updated && updated.source !== event.source && updated.source === updateMetadata(event, { tags })) {
            for (const [source, previous] of this.eventRebases) {
              if (previous.source === event.source) this.eventRebases.set(source, updated);
            }
            this.eventRebases.set(event.source, updated);
          }
        }
      }
    });
  }

  eventDraft(key: string, original: ArchiveEvent | null): EventPageDraft {
    let draft = this.eventDrafts.get(key);
    if (!draft || (!draft.dirty && !this.pendingSaves.has(key) && !this.saveErrors.has(key) && draft.original !== original)) {
      draft = new EventPageDraft(this, original);
      this.eventDrafts.set(key, draft);
    }
    return draft;
  }

  labelDraft(key: string, original: Label | null): LabelPageDraft {
    let draft = this.labelDrafts.get(key);
    if (!draft || (!draft.dirty && !this.pendingSaves.has(key) && !this.saveErrors.has(key) && draft.original !== original)) {
      draft = new LabelPageDraft(this, original);
      this.labelDrafts.set(key, draft);
    }
    return draft;
  }

  discardDraft(key: string) {
    this.saveErrors.delete(key);
    this.eventDrafts.delete(key);
    this.labelDrafts.delete(key);
  }

  /** Interprets filesystem writes, which can succeed even when refreshing the screen fails. */
  result<T>(outcome: MutationOutcome<T>, successMessage = 'Saved.'): T {
    if (outcome.status === 'failed') {
      if (outcome.error.code === 'partial-change' || outcome.error.recoveryPaths.length) this.reviewRequired = true;
      throw outcome.error;
    }
    if (outcome.refresh === 'failed') {
      this.savedRefreshError = outcome.refreshError;
      this.notify(`Saved, but refreshing failed: ${outcome.refreshError.message}. Refresh or reconnect; do not repeat the save.`, 'error');
    } else this.notice = successMessage;
    return outcome.result.value;
  }

  async disconnect() {
    if (this.draftCount) { this.notice = 'Save or cancel drafts before closing the archive.'; return; }
    await this.workspace.disconnect();
    if (!this.workspace.archive && this.workspace.state === 'no-folder') {
      this.eventDrafts.clear();
      this.labelDrafts.clear();
      this.saveErrors.clear();
      this.reviewRequired = false;
      this.eventRebases.clear();
      this.viewer = null;
      this.notice = 'Archive closed.';
    }
  }

  async refresh() {
    if (this.pendingSaves.size) { this.notice = 'Wait for pending saves before refreshing the archive.'; return; }
    await this.workspace.refresh();
    if (this.workspace.state === 'ready') {
      this.reviewRequired = false;
      this.notice = 'Archive refreshed. Review any partial changes before continuing.';
    }
  }
}

/** Remembers completed imports for the lifetime of a draft so a failed record save does not import them twice. */
export class DraftPictures {
  private imported = new Map<File, string>();
  readonly frames = new SvelteMap<File, PictureFrame>();
  pending = $state(0);
  constructor(private session: Session) {}
  frame(file: File): PictureFrame { return this.frames.get(file) ?? containedFrame(400); }
  async prepare(file: File) {
    this.pending++;
    try { return await processPicture(file); }
    finally { this.pending--; }
  }
  async import(file: File): Promise<string> {
    const known = this.imported.get(file);
    if (known) return known;
    await this.prepare(file);
    const outcome = await this.session.workspace.importPicture(file);
    const name = this.session.result(outcome, 'Picture imported.');
    this.imported.set(file, name);
    if (outcome.status === 'saved' && outcome.refresh === 'failed') {
      throw new ArchiveFailure('unavailable', 'Picture saved, but refresh failed. Refresh or reconnect before saving the record. The imported picture will be reused.');
    }
    return name;
  }
}

/** Keeps an event's unsaved fields and completed imports alive across route unmounts, never browser reloads. */
export class EventPageDraft {
  frames = $state<Record<string, PictureFrame>>({});
  value = $state<EventDraft>({ title: '', date: '', endDate: '', description: '', labelIds: [], pictures: [], removedPictureIds: [] });
  blocked = $state(false);
  readonly pictures: DraftPictures;
  private readonly initial: string;
  get dirty() { return this.blocked || this.pictures.pending > 0 || JSON.stringify([this.value, this.frames]) !== this.initial; }
  constructor(session: Session, readonly original: ArchiveEvent | null) {
    const initial = editorInitial(original);
    this.frames = { ...original?.frames };
    this.value = { title: initial.title ?? '', date: initial.date ?? '', endDate: initial.endDate ?? '', description: initial.description ?? '', labelIds: initial.labelIds ?? [], pictures: [], removedPictureIds: [] };
    this.pictures = new DraftPictures(session);
    this.initial = JSON.stringify([this.value, this.frames]);
  }
}

export class LabelPageDraft {
  frame = $state.raw<PictureFrame | undefined>(undefined);
  value = $state<LabelEditorDraft>({ name: '', picture: null, removePicture: false });
  blocked = $state(false);
  readonly pictures: DraftPictures;
  private readonly initial: string;
  get dirty() { return this.blocked || this.pictures.pending > 0 || JSON.stringify([this.value, this.frame]) !== this.initial; }
  constructor(session: Session, readonly original: Label | null) {
    this.frame = original?.picture_frame;
    this.value = { name: original?.title ?? '', picture: null, removePicture: false };
    this.pictures = new DraftPictures(session);
    this.initial = JSON.stringify([this.value, this.frame]);
  }
}
