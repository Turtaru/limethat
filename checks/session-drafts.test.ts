import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import { newEvent, parseLabels } from '../src/lib/archive-format';
import { containedFrame } from '../src/lib/images/image-frame';

let server: ViteDevServer;
let Session: typeof import('../src/features/session.svelte').Session;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ Session } = await server.ssrLoadModule('/src/features/session.svelte.ts'));
});
after(async () => { await server?.close(); });

test('opening unchanged event and label editors does not count as unsaved work', () => {
  const session = new Session();
  session.eventDraft('/events/new', null);
  session.eventDraft('/events/existing/edit', newEvent());
  session.labelDraft('/labels/new', null);
  session.labelDraft('/labels/1/edit', parseLabels('[{"id":1,"title":"Family"}]')[0]);
  assert.equal(session.draftCount, 0);
});

test('field and picture framing changes count until reverted', () => {
  const session = new Session();
  const event = newEvent();
  event.frames = { 'one.jpg': containedFrame(400) };
  const page = session.eventDraft('/events/existing/edit', event);
  const title = page.value.title;
  page.value.title = 'Changed title';
  assert.equal(session.draftCount, 1);
  page.value.title = title;
  assert.equal(session.draftCount, 0);
  page.frames['one.jpg'] = { ...page.frames['one.jpg'], offsetX: 12 };
  assert.equal(session.draftCount, 1);
  page.frames = { ...event.frames };
  assert.equal(session.draftCount, 0);
  const label = session.labelDraft('/labels/new', null);
  label.value.name = 'Family';
  assert.equal(session.draftCount, 1);
  label.value.name = '';
  label.frame = containedFrame(400);
  assert.equal(session.draftCount, 1);
  label.frame = undefined;
  assert.equal(session.draftCount, 0);
});

test('selected pictures, preparation, blocked drafts, and failed saves remain protected', () => {
  const session = new Session();
  const page = session.eventDraft('/events/new', null);
  page.value.pictures = [new File(['picture'], 'picture.jpg', { type: 'image/jpeg' })];
  assert.equal(session.draftCount, 1);
  page.value.pictures = [];
  page.pictures.pending = 1;
  assert.equal(session.draftCount, 1);
  page.pictures.pending = 0;
  page.blocked = true;
  assert.equal(session.draftCount, 1);
  page.blocked = false;
  session.saveErrors.set('/events/new', 'Save failed.');
  assert.equal(session.draftCount, 1);
  session.discardDraft('/events/new');
  assert.equal(session.draftCount, 0);
});

test('clean cached editors follow refreshed records while changed drafts keep their original base', () => {
  const session = new Session();
  const original = newEvent();
  const first = session.eventDraft('/events/existing/edit', original);
  const refreshed = { ...original, title: 'External title' };
  const second = session.eventDraft('/events/existing/edit', refreshed);
  assert.notEqual(second, first);
  assert.equal(second.value.title, 'External title');
  second.value.title = 'My unsaved title';
  assert.equal(session.eventDraft('/events/existing/edit', { ...refreshed, title: 'Another title' }), second);
  assert.equal(second.value.title, 'My unsaved title');
  const label = parseLabels('[{"id":1,"title":"Family"}]')[0];
  const labelPage = session.labelDraft('/labels/1/edit', label);
  assert.notEqual(session.labelDraft('/labels/1/edit', { ...label, title: 'Friends' }), labelPage);
});

test('closing clears pristine cached editors but refuses to discard changed drafts', async () => {
  const session = new Session();
  const page = session.eventDraft('/events/new', null);
  session.labelDraft('/labels/new', null);
  let closed = false;
  session.workspace.disconnect = async () => { closed = true; session.workspace.state = 'no-folder'; };
  page.value.title = 'Keep this';
  await session.disconnect();
  assert.equal(closed, false);
  assert.equal(page.value.title, 'Keep this');
  page.value.title = '';
  await session.disconnect();
  assert.equal(closed, true);
  assert.equal(session.eventDrafts.size, 0);
  assert.equal(session.labelDrafts.size, 0);
  assert.equal(session.draftCount, 0);
});
