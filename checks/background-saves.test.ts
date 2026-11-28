import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer, type ViteDevServer } from 'vite';
import { editEvent, newEvent } from '../src/lib/archive-format';
import { MemoryFolder } from './memory-folder';
import type { Session as SessionType } from '../src/features/session.svelte';

let server: ViteDevServer;
let Session: typeof import('../src/features/session.svelte').Session;
let Archive: typeof import('../src/lib/archive').Archive;

before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  ({ Session } = await server.ssrLoadModule('/src/features/session.svelte.ts'));
  ({ Archive } = await server.ssrLoadModule('/src/lib/archive.ts'));
});
after(async () => { await server?.close(); });

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function waitFor(ready: () => boolean) {
  for (let attempts = 0; attempts < 500; attempts++) {
    if (ready()) return;
    await delay(5);
  }
  assert.fail('Background save did not reach the expected state.');
}

async function fixture() {
  const root = new MemoryFolder();
  const archive = new Archive(root.handle());
  await archive.initialize();
  await root.put('tags.json', '[{"id":1,"title":"Family"}]');
  for (let index = 0; index < 3; index++) {
    const event = newEvent();
    await root.put(`moments/${event.filename}`, editEvent(event, {
      title: `Event ${index}`, body: '', startDate: null, endDate: null, frames: {},
      tags: index < 2 ? [{ id: '1', title: 'Family' }] : [],
    }));
  }
  archive.eventCache.save = async () => {};
  const session = new Session();
  session.workspace.archive = archive;
  session.workspace.summary = await archive.load();
  session.workspace.state = 'ready';
  session.workspace.permission = 'granted';
  const events = session.workspace.summary.events;
  const keys = events.map(event => `/events/${event.id}/edit`);
  const pages = events.map((event, index) => session.eventDraft(keys[index], event));
  return { root, archive, session, events, keys, pages };
}

async function finish(session: SessionType) {
  await waitFor(() => session.pendingSaves.size === 0);
}

test('saves capture drafts, lock only their records, and serialize writes across route lifetimes', async () => {
  const { archive, session, events, keys, pages } = await fixture();
  const blocked = gate();
  const started: string[] = [];
  const update = archive.updateEvent.bind(archive);
  archive.updateEvent = async (original, draft) => {
    started.push(original.id);
    if (started.length === 1) await blocked.promise;
    return update(original, draft);
  };
  pages[0].value.title = 'Captured title';
  session.saveEvent(keys[0], pages[0], pages[0].value);
  pages[0].value.title = 'Later mutation';
  session.saveEvent(keys[1], pages[1], { ...pages[1].value, title: 'Second title' });
  await waitFor(() => started.length === 1);
  assert.equal(session.canEdit, true);
  assert.equal(session.canWrite, false);
  assert.equal(session.eventSaving(events[0].id.toUpperCase()), true);
  assert.equal(session.eventSaving(events[1].id), true);
  assert.equal(session.eventSaving(events[2].id), false);
  assert.equal(session.pendingSaves.size, 2);
  assert.throws(() => session.saveEvent(keys[0], pages[0], pages[0].value), /finish saving/);
  await session.refresh();
  assert.match(session.notice, /pending saves/);
  assert.equal(session.workspace.operation, 'saving');
  blocked.release();
  await finish(session);
  assert.deepEqual(started, [events[0].id, events[1].id]);
  assert.equal(session.workspace.summary!.events.find(event => event.id === events[0].id)!.title, 'Captured title');
  assert.equal(session.workspace.summary!.events.find(event => event.id === events[1].id)!.title, 'Second title');
  assert.equal(session.eventDrafts.has(keys[0]), false);
  assert.equal(session.eventDrafts.has(keys[1]), false);
  assert.equal(session.draftCount, 0);
  assert.equal(session.saveErrors.size, 0);
  assert.equal(session.canWrite, true);
  const saves = session.activity.entries.filter(entry => entry.message.startsWith('Saving Event:'));
  assert.equal(saves.length, 2);
  assert.ok(saves.every(entry => entry.status === 'complete'));
});

test('picture preparation belongs to the save job and captures submitted frames', async () => {
  const { archive, session, events, keys, pages } = await fixture();
  const blocked = gate();
  const picture = new File(['picture'], 'picture.jpg', { type: 'image/jpeg' });
  const page = pages[0];
  page.value.pictures = [picture];
  const frame = { offsetX: 2, offsetY: 3, cropWidth: 400, cropHeight: 300, cropScale: 1 };
  page.pictures.frames.set(picture, frame);
  let importing = false;
  page.pictures.import = async () => { importing = true; await blocked.promise; return 'imported.jpg'; };
  session.saveEvent(keys[0], page, page.value);
  await waitFor(() => importing);
  frame.offsetX = 99;
  assert.equal(session.workspace.operation, null);
  assert.equal(session.eventSaving(events[0].id), true);
  assert.equal(session.canEdit, true);
  assert.equal(session.canWrite, false);
  assert.equal(archive.operating, false);
  blocked.release();
  await finish(session);
  const saved = session.workspace.summary!.events.find(event => event.id === events[0].id)!;
  assert.equal(saved.frames['imported.jpg'].offsetX, 2);
  assert.match(saved.body, /imported\.jpg/);
});

test('conflicts retain drafts and report errors even without a mounted editor; queued jobs stop safely', async () => {
  const { root, session, events, keys, pages } = await fixture();
  await root.put(`moments/${events[0].filename}`, events[0].source + '\nExternal change');
  session.saveEvent(keys[0], pages[0], { ...pages[0].value, title: 'Do not overwrite' });
  session.saveEvent(keys[1], pages[1], { ...pages[1].value, title: 'Not written yet' });
  await finish(session);
  assert.equal(session.eventDrafts.get(keys[0]), pages[0]);
  assert.equal(session.eventDrafts.get(keys[1]), pages[1]);
  assert.match(session.saveErrors.get(keys[0])!, /changed outside/);
  assert.match(session.saveErrors.get(keys[1])!, /Reconnect or refresh/);
  assert.equal(await root.text(`moments/${events[1].filename}`), events[1].source);
  assert.match(await root.text(`moments/${events[0].filename}`), /External change/);
  assert.equal(session.canEdit, false);
  session.discardDraft(keys[0]);
  session.discardDraft(keys[1]);
  assert.equal(session.saveErrors.size, 0);
});

test('label renames lock affected events and rebase their existing drafts after verified writes', async () => {
  const { archive, session, events, keys, pages } = await fixture();
  const label = session.workspace.summary!.labels[0];
  const labelPage = session.labelDraft('/labels/1/edit', label);
  const blocked = gate();
  const update = archive.updateLabel.bind(archive);
  let started = false;
  archive.updateLabel = async (summary, id, draft) => { started = true; await blocked.promise; return update(summary, id, draft); };
  session.saveLabel('/labels/1/edit', labelPage, { ...labelPage.value, name: 'Friends' });
  await waitFor(() => started);
  for (const event of events) assert.equal(session.eventSaving(event.id), event.tags.length > 0);
  assert.equal(session.labelSaving('1'), true);
  const affected = events.findIndex(event => event.tags.length > 0);
  assert.throws(() => session.saveEvent(keys[affected], pages[affected], pages[affected].value), /finish saving/);
  blocked.release();
  await finish(session);
  assert.equal(session.saveErrors.size, 0);
  assert.equal(session.labelDrafts.size, 0);
  session.saveEvent(keys[affected], pages[affected], { ...pages[affected].value, title: 'Edited after rename' });
  await finish(session);
  assert.equal(session.saveErrors.size, 0);
  const saved = session.workspace.summary!.events.find(event => event.id === events[affected].id)!;
  assert.equal(saved.title, 'Edited after rename');
  assert.equal(saved.tags[0].title, 'Friends');
});

test('queued creation and label saves use fresh summaries and lock newly created affected events', async () => {
  const { archive, session } = await fixture();
  const page = session.eventDraft('/events/new', null);
  session.saveEvent('/events/new', page, { ...page.value, title: 'New event', labelIds: ['1'] });
  const label = session.workspace.summary!.labels[0];
  const labelPage = session.labelDraft('/labels/1/edit', label);
  const blocked = gate();
  const update = archive.updateLabel.bind(archive);
  let started = false;
  archive.updateLabel = async (summary, id, draft) => { started = true; await blocked.promise; return update(summary, id, draft); };
  session.saveLabel('/labels/1/edit', labelPage, { ...labelPage.value, name: 'Friends' });
  const newLabelPage = session.labelDraft('/labels/new', null);
  session.saveLabel('/labels/new', newLabelPage, { ...newLabelPage.value, name: 'Another label' });
  await waitFor(() => started);
  const created = session.workspace.summary!.events.find(event => event.title === 'New event')!;
  assert.ok(created);
  assert.equal(session.eventSaving(created.id), true);
  blocked.release();
  await finish(session);
  assert.equal(session.saveErrors.size, 0);
  assert.equal(session.workspace.summary!.events.find(event => event.id === created.id)!.tags[0].title, 'Friends');
  assert.deepEqual(session.workspace.summary!.labels.map(label => label.title), ['Friends', 'Another label']);
});

test('renaming a label back to its old title does not create a source-rebase cycle', async () => {
  const { session, events, keys, pages } = await fixture();
  const affected = events.findIndex(event => event.tags.length > 0);
  for (const name of ['Friends', 'Family', 'Friends again']) {
    const label = session.workspace.summary!.labels[0];
    const page = session.labelDraft('/labels/1/edit', label);
    session.saveLabel('/labels/1/edit', page, { ...page.value, name });
    await finish(session);
  }
  session.saveEvent(keys[affected], pages[affected], { ...pages[affected].value, title: 'After repeated renames' });
  await finish(session);
  assert.equal(session.saveErrors.size, 0);
  const saved = session.workspace.summary!.events.find(event => event.id === events[affected].id)!;
  assert.equal(saved.title, 'After repeated renames');
  assert.equal(saved.tags[0].title, 'Friends again');
});

test('external changes during a label refresh are not accepted as our own tag rewrite', async () => {
  const { root, archive, session, events, keys, pages } = await fixture();
  const affected = events.findIndex(event => event.tags.length > 0);
  const refresh = archive.refresh.bind(archive);
  archive.refresh = async () => {
    const path = `moments/${events[affected].filename}`;
    await root.put(path, await root.text(path) + '\nExternal change');
    return refresh();
  };
  const label = session.workspace.summary!.labels[0];
  const page = session.labelDraft('/labels/1/edit', label);
  session.saveLabel('/labels/1/edit', page, { ...page.value, name: 'Friends' });
  await finish(session);
  archive.refresh = refresh;
  session.saveEvent(keys[affected], pages[affected], { ...pages[affected].value, title: 'Stale title' });
  await finish(session);
  assert.match(session.saveErrors.get(keys[affected])!, /changed outside/);
  assert.match(await root.text(`moments/${events[affected].filename}`), /External change/);
});

test('partial writes block only the attempted draft, not jobs that never started', async () => {
  const { root, session, events, keys, pages } = await fixture();
  root.control.fail = `moments/${events[0].filename}`;
  session.saveEvent(keys[0], pages[0], { ...pages[0].value, title: 'First change' });
  session.saveEvent(keys[1], pages[1], { ...pages[1].value, title: 'Queued change' });
  await finish(session);
  assert.equal(session.reviewRequired, true);
  assert.equal(pages[0].blocked, true);
  assert.equal(pages[1].blocked, false);
  assert.equal(await root.text(`moments/${events[1].filename}`), events[1].source);
  assert.match(session.saveErrors.get(keys[1])!, /Reconnect or refresh/);
});

test('a refreshed external edit is not silently rebased into an older draft', async () => {
  const { root, session, events, keys, pages } = await fixture();
  await root.put(`moments/${events[0].filename}`, events[0].source + '\nExternal change');
  await session.refresh();
  session.saveEvent(keys[0], pages[0], { ...pages[0].value, title: 'Stale draft' });
  await finish(session);
  assert.match(session.saveErrors.get(keys[0])!, /changed outside/);
  assert.match(await root.text(`moments/${events[0].filename}`), /External change/);
});

test('a committed save with a failed refresh discards its draft and never offers a duplicate write', async () => {
  const { root, archive, session, events, keys, pages } = await fixture();
  archive.refresh = async () => { throw new Error('Refresh unavailable'); };
  session.saveEvent(keys[0], pages[0], { ...pages[0].value, title: 'Already saved' });
  await finish(session);
  assert.match(await root.text(`moments/${events[0].filename}`), /Already saved/);
  assert.equal(session.eventDrafts.has(keys[0]), false);
  assert.equal(session.saveErrors.size, 0);
  assert.match(session.notice, /Saved, but refreshing failed/);
  assert.equal(session.savedRefreshError, session.workspace.error);
  assert.ok(session.activity.entries.some(entry => entry.level === 'error' && entry.message.includes('do not repeat the save')));
  assert.equal(session.canEdit, false);
});

test('invalid dates are rejected before a save is enqueued', async () => {
  const { session, keys, pages } = await fixture();
  assert.throws(() => session.saveEvent(keys[0], pages[0], { ...pages[0].value, date: '2026-02-30' }), /Check the date/);
  assert.equal(session.pendingSaves.size, 0);
  assert.equal(session.eventDrafts.has(keys[0]), true);
});
