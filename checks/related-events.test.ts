import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Archive, TRANSLATION_RECOVERY } from '../src/lib/archive';
import { labelKey, newEvent, parseEvent, serialize, updateMetadata } from '../src/lib/archive-format';
import { needsRelatedEventsTranslation, relatedEventGroups, relatedEventsTranslated } from '../src/lib/related-events';
import { description } from '../src/features/models';
import { MemoryFolder } from './memory-folder';

async function fixture() {
  const root = new MemoryFolder();
  const archive = new Archive(root.handle());
  await archive.initialize();
  const events = Array.from({ length: 4 }, () => newEvent());
  for (const [index, event] of events.entries()) {
    const related = index < 2 ? [events[index + 1].id] : [event.id];
    const source = updateMetadata(event, { related_events: related, custom: { retained: true },
      tags: [{ id: '8', title: 'Existing', extra: true }] });
    await root.put(`moments/${event.filename}`, source);
  }
  await root.put('tags.json', '[{"id":8,"title":"Existing"}]\n');
  const manifest = JSON.parse(await root.text('manifest.json'));
  manifest.limethat_web = { custom: true, migrations: { other: { completed_at: 'earlier' } } };
  await root.put('manifest.json', JSON.stringify(manifest));
  return { root, archive, snapshot: await archive.load() };
}

test('display hides only empty photo sections without changing Markdown or picture references', () => {
  const body = 'Text\n\n## Photos\n\n![Photo](../attachments/one.jpg)';
  assert.equal(description(body), 'Text');
  assert.ok(body.includes('## Photos'));
  assert.equal(description('## Photos'), '');
  assert.equal(description('## Photos\n\nA caption\n![Photo](../attachments/one.jpg)'), '## Photos\n\nA caption');
  assert.equal(description(`${body}\n\n## Notes\nKeep this`), 'Text\n\n## Notes\nKeep this');
  assert.equal(description('## Photos\n\n### Details\nKeep'), '## Photos\n\n### Details\nKeep');
});

test('translation groups indirect, one-way links and ignores self-only links', async () => {
  const { snapshot } = await fixture();
  const groups = relatedEventGroups(snapshot.events);
  assert.deepEqual(groups.map(group => group.length), [3]);
  assert.equal(needsRelatedEventsTranslation(snapshot), true);
  assert.equal(relatedEventsTranslated(snapshot), false);
});

test('translation preserves relationships and existing data, backs up files and marks completion', async () => {
  const { root, archive, snapshot } = await fixture();
  const originalManifest = await root.text('manifest.json');
  const result = await archive.translateRelatedEvents(snapshot);
  const translated = await archive.load();
  assert.equal(relatedEventsTranslated(translated), true);
  assert.equal(needsRelatedEventsTranslation(translated), false);
  assert.equal(translated.labels.length, 2);
  const added = translated.labels.find(label => labelKey(label.id) !== '8')!;
  assert.equal(labelKey(added.id), '9');
  const groupIds = new Set(relatedEventGroups(snapshot.events)[0].map(event => event.id));
  for (const event of translated.events) {
    const before = snapshot.events.find(item => item.id === event.id)!;
    assert.deepEqual(event.metadata.related_events, before.metadata.related_events);
    assert.deepEqual(event.metadata.custom, before.metadata.custom);
    assert.deepEqual(event.tags[0], before.tags[0]);
    assert.equal(event.body, before.body);
    assert.equal(event.tags.length, groupIds.has(event.id) ? 2 : 1);
    if (groupIds.has(event.id)) assert.equal(event.tags[1].id, labelKey(added.id));
    else assert.equal(event.source, before.source);
  }
  const web = translated.manifest.limethat_web as any;
  assert.equal(web.custom, true);
  assert.equal(web.migrations.other.completed_at, 'earlier');
  assert.ok(Number.isFinite(Date.parse(web.migrations.related_events_to_tags.completed_at)));
  assert.equal(result.recoveryPaths.length, 5);
  const backup = result.recoveryPaths.find(path => path.startsWith('manifest.json.backup-'))!;
  assert.equal(await root.text(backup), originalManifest);
  assert.equal(result.affectedPaths.at(-1), 'manifest.json');
  assert.equal(await archive.hasTranslationRecovery(), false);
  await assert.rejects(archive.translateRelatedEvents(translated), /No related events need translation/);
});

test('missing targets and stale archives prevent translation before any original writes', async () => {
  const { root, archive, snapshot } = await fixture();
  const event = snapshot.events[0];
  const invalid = parseEvent(event.filename, updateMetadata(event, { related_events: [crypto.randomUUID()] }));
  assert.throws(() => relatedEventGroups([invalid]), /Missing related event/);
  const originalTags = await root.text('tags.json');
  await root.put(`moments/${event.filename}`, event.source + '\nChanged externally');
  await assert.rejects(archive.translateRelatedEvents(snapshot), { code: 'conflict' });
  assert.equal(await root.text('tags.json'), originalTags);
  assert.equal(serialize((await archive.load()).manifest), serialize(snapshot.manifest));
});

test('a transient write failure automatically restores all originals and allows retry', async () => {
  const { root, archive, snapshot } = await fixture();
  const originalManifest = await root.text('manifest.json');
  root.control.afterWrite = path => {
    if (path === 'tags.json') root.control.corrupt = 'moments/';
    if (path.startsWith('moments/') && !path.includes('.backup-')) {
      root.control.corrupt = undefined;
      root.control.afterWrite = undefined;
    }
  };
  await assert.rejects(archive.translateRelatedEvents(snapshot), /Migration rolled back/);
  assert.equal(await archive.hasTranslationRecovery(), false);
  assert.equal(await root.text('tags.json'), snapshot.tagsSource);
  assert.equal(await root.text('manifest.json'), originalManifest);
  for (const event of snapshot.events) assert.equal(await root.text(`moments/${event.filename}`), event.source);
  await archive.translateRelatedEvents(await archive.load());
  assert.equal(relatedEventsTranslated(await archive.load()), true);
});

test('unfinished rollback survives reopening, blocks writes and can be retried', async () => {
  const { root, archive, snapshot } = await fixture();
  const group = relatedEventGroups(snapshot.events)[0];
  root.control.fail = `moments/${group[0].filename}`;
  await assert.rejects(archive.translateRelatedEvents(snapshot), { code: 'partial-change' });
  const reopened = new Archive(root.handle());
  assert.equal(await reopened.hasTranslationRecovery(), true);
  const event = snapshot.events[0];
  await assert.rejects(reopened.deleteEvent(event), /Roll back the unfinished migration/);
  await assert.rejects(reopened.rollbackRelatedEvents());
  assert.equal(await reopened.hasTranslationRecovery(), true);
  root.control.fail = undefined;
  await reopened.rollbackRelatedEvents();
  assert.equal(await reopened.hasTranslationRecovery(), false);
  assert.equal(relatedEventsTranslated(await reopened.load()), false);
  for (const original of snapshot.events) assert.equal(await root.text(`moments/${original.filename}`), original.source);
});

test('recovery works without parsing damaged originals and validates all backups before restoring', async () => {
  const { root, snapshot } = await fixture();
  const files = [];
  for (const path of ['tags.json', 'manifest.json']) {
    const backup = `${path}.backup-${crypto.randomUUID()}`;
    await root.put(backup, await root.text(path));
    files.push({ path, backup });
    await root.put(path, 'Damaged original');
  }
  await root.put(TRANSLATION_RECOVERY, serialize({ version: 1, files }));
  const archive = new Archive(root.handle());
  await archive.rollbackRelatedEvents();
  assert.equal(await root.text('tags.json'), snapshot.tagsSource);
  assert.equal(await archive.hasTranslationRecovery(), false);
  assert.equal(relatedEventsTranslated(await archive.load()), false);
});

test('invalid backup paths cannot overwrite archive files', async () => {
  const { root, archive, snapshot } = await fixture();
  await root.put(TRANSLATION_RECOVERY, serialize({ version: 1, files: [{ path: 'tags.json', backup: 'manifest.json' }] }));
  await assert.rejects(archive.rollbackRelatedEvents(), /Invalid recovery backup/);
  assert.equal(await root.text('tags.json'), snapshot.tagsSource);
  assert.equal(await archive.hasTranslationRecovery(), true);
});
