import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let SystemActivity: typeof import('../src/lib/system-activity.svelte').SystemActivity;
let activityProgress: typeof import('../src/lib/system-activity.svelte').activityProgress;
let Session: typeof import('../src/features/session.svelte').Session;

before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ SystemActivity, activityProgress } = await server.ssrLoadModule('/src/lib/system-activity.svelte.ts'));
  ({ Session } = await server.ssrLoadModule('/src/features/session.svelte.ts'));
});
after(async () => { await server?.close(); });

test('operations update their original history entry, including failures', () => {
  const activity = new SystemActivity();
  const first = activity.add('Saving event', 'info', 'running');
  const second = activity.add('Saving label', 'info', 'running');
  activity.finish(first);
  activity.finish(second, 'Folder permission was lost.');
  assert.equal(activity.entries.length, 2);
  assert.equal(activity.entries[0].status, 'complete');
  assert.equal(activity.entries[1].status, 'failed');
  assert.equal(activity.entries[1].level, 'error');
  assert.match(activity.entries[1].message, /Folder permission was lost/);
  assert.ok(activity.entries.every(entry => Number.isFinite(entry.time)));
});

test('reading history does not resolve issues; source recovery does', () => {
  const activity = new SystemActivity();
  const issue = { key: 'archive', message: 'Reconnect archive.', level: 'error' as const };
  activity.syncIssues([issue]);
  activity.open = true;
  activity.open = false;
  activity.syncIssues([issue]);
  assert.equal(activity.issues.length, 1);
  assert.equal(activity.entries.length, 1);
  const entries = activity.entries;
  activity.syncIssues([issue]);
  assert.equal(activity.entries, entries);
  activity.syncIssues([{ ...issue, message: 'Read access was lost.' }]);
  assert.equal(activity.entries.length, 1);
  assert.equal(activity.entries[0].message, 'Read access was lost.');
  activity.syncIssues([]);
  assert.equal(activity.issues.length, 0);
  assert.equal(activity.entries[0].status, 'resolved');
  activity.syncIssues([issue]);
  assert.equal(activity.entries.length, 2);
});

test('known progress uses completed of total; enumeration and unrelated operations are indeterminate', () => {
  const load = { phase: 'reading', read: 12, total: 80 };
  assert.deepEqual(activityProgress('opening', load, null), { value: 12, total: 80, message: 'Checking events · 12 of 80' });
  assert.equal(activityProgress('opening', { ...load, phase: 'enumerating' }, null), null);
  assert.equal(activityProgress('opening', { ...load, total: 0 }, null), null);
  assert.equal(activityProgress('saving', load, null), null);
  assert.equal(activityProgress('refreshing', load, null), null);
  assert.equal(activityProgress(null, load, { processed: 10, total: 20 }), null);
  assert.deepEqual(activityProgress('creating thumbnails', load, { processed: 10, total: 20 }), {
    value: 10, total: 20, message: 'Processing pictures · 10 of 20',
  });
});

test('session notices are logged even when repeated; history is isolated per session', () => {
  const session = new Session();
  session.notice = 'Saved.';
  session.notice = 'Saved.';
  session.notify('Theme preference was not remembered.', 'warning');
  assert.equal(session.notice, 'Theme preference was not remembered.');
  assert.equal(session.activity.entries.length, 3);
  assert.equal(session.activity.entries[2].level, 'warning');
  assert.equal(new Session().activity.entries.length, 0);
});

test('workspace operations preserve failed outcomes in history after busy state clears', async () => {
  const session = new Session();
  await session.workspace.refresh();
  assert.equal(session.workspace.operation, null);
  assert.equal(session.activity.entries.length, 1);
  assert.equal(session.activity.entries[0].status, 'failed');
  assert.match(session.activity.entries[0].message, /Choose an archive folder first/);
});
