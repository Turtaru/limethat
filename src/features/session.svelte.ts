import { getContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import { push } from 'svelte-spa-router';
import { Workspace } from '../lib/workspace.svelte';
import type { MutationOutcome } from '../lib/workspace.svelte';
import type { ArchiveEvent, Label, PictureFrame } from '../lib/archive-format';
import { ArchiveFailure } from '../lib/errors';
import { pwa } from './pwa.svelte';
import { editorInitial, eventHref, labelHref } from './models';
import { labelKey } from '../lib/archive-format';
import type { EventDraft, LabelEditorDraft } from '../lib/ui-kit/types';
import { containedFrame } from '../lib/images/image-frame';
import { processPicture } from '../lib/pictures';

export const sessionKey = Symbol('limethat');
export const useSession = () => getContext<Session>(sessionKey);

export class Session {
  workspace = new Workspace();
  notice = $state('');
  theme = $state<'dark' | 'light'>('dark');
  reviewRequired = $state(false);
  draftCount = $state(0);
  readonly eventDrafts = new Map<string, EventPageDraft>();
  readonly labelDrafts = new Map<string, LabelPageDraft>();
  viewer = $state<{ name: string; alt: string; section?: 'events' | 'labels' } | null>(null);
  get canWrite() { return this.workspace.state === 'ready' && !this.workspace.operation && !this.reviewRequired && !pwa.activating; }
  editEvent(event: ArchiveEvent | null) { void push(event ? `${eventHref(event.id)}/edit` : '/events/new'); }
  editLabel(label: Label | null) { void push(label ? `${labelHref(labelKey(label.id))}/edit` : '/labels/new'); }

  eventDraft(key: string, original: ArchiveEvent | null): EventPageDraft {
    let draft = this.eventDrafts.get(key);
    if (!draft) {
      draft = new EventPageDraft(this, original);
      this.eventDrafts.set(key, draft);
      this.draftCount++;
    }
    return draft;
  }

  labelDraft(key: string, original: Label | null): LabelPageDraft {
    let draft = this.labelDrafts.get(key);
    if (!draft) {
      draft = new LabelPageDraft(this, original);
      this.labelDrafts.set(key, draft);
      this.draftCount++;
    }
    return draft;
  }

  discardDraft(key: string) {
    this.eventDrafts.delete(key);
    this.labelDrafts.delete(key);
    this.draftCount = this.eventDrafts.size + this.labelDrafts.size;
  }

  /** Interprets filesystem writes, which can succeed even when refreshing the screen fails. */
  result<T>(outcome: MutationOutcome<T>): T {
    if (outcome.status === 'failed') {
      if (outcome.error.code === 'partial-change' || outcome.error.recoveryPaths.length) this.reviewRequired = true;
      throw outcome.error;
    }
    if (outcome.refresh === 'failed') {
      this.notice = `Saved, but refreshing failed: ${outcome.refreshError.message}. Refresh or reconnect; do not repeat the save.`;
    } else this.notice = 'Saved.';
    return outcome.result.value;
  }

  async disconnect() {
    if (this.draftCount) { this.notice = 'Save or cancel drafts before closing the archive.'; return; }
    await this.workspace.disconnect();
    if (!this.workspace.archive && this.workspace.state === 'no-folder') {
      this.reviewRequired = false;
      this.viewer = null;
      this.notice = 'Archive closed.';
    }
  }

  async refresh() {
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
    const name = this.session.result(outcome);
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
  constructor(session: Session, readonly original: ArchiveEvent | null) {
    const initial = editorInitial(original);
    this.frames = { ...original?.frames };
    this.value = { title: initial.title ?? '', date: initial.date ?? '', endDate: initial.endDate ?? '', description: initial.description ?? '', labelIds: initial.labelIds ?? [], pictures: [], removedPictureIds: [] };
    this.pictures = new DraftPictures(session);
  }
}

export class LabelPageDraft {
  frame = $state.raw<PictureFrame | undefined>(undefined);
  value = $state<LabelEditorDraft>({ name: '', picture: null, removePicture: false });
  blocked = $state(false);
  readonly pictures: DraftPictures;
  constructor(session: Session, readonly original: Label | null) {
    this.frame = original?.picture_frame;
    this.value = { name: original?.title ?? '', picture: null, removePicture: false };
    this.pictures = new DraftPictures(session);
  }
}
