import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Archive, type ArchiveLoadProgress } from '../src/lib/archive';
import {
  editEvent, labelKey, newEvent, nextLabelId, parseEvent, parseLabels, serialize, validateDate, validateFrame,
} from '../src/lib/archive-format';
import type { ArchiveEvent, EventDraft } from '../src/lib/archive-format';
import { ArchiveFailure } from '../src/lib/errors';
import { defaultFrame, pictureBounds, resizedFrame, zoomFrame } from '../src/lib/pictures';
import { MemoryFolder } from './memory-folder';

function draft(event: ArchiveEvent, title = event.title): EventDraft {
  return { title, body: event.body, tags: event.tags, frames: event.frames, startDate: event.startDate, endDate: event.endDate };
}

async function fixture() {
  const root = new MemoryFolder();
  const archive = new Archive(root.handle());
  await archive.initialize();
  const original = newEvent();
  await root.put(`moments/${original.filename}`, original.source);
  return { root, archive, original };
}

test('load and refresh reuse enumerated event handles without per-event lookups', async () => {
  const { root, archive } = await fixture();
  for (let index = 0; index < 9; index++) {
    const event = newEvent();
    await root.put(`moments/${event.filename}`, event.source);
  }
  const directory = await root.getDirectoryHandle('moments');
  let directoryLookups = 0;
  let fileLookups = 0;
  const getDirectoryHandle = root.getDirectoryHandle.bind(root);
  root.getDirectoryHandle = async (name, options) => {
    if (name === 'moments') directoryLookups++;
    return getDirectoryHandle(name, options);
  };
  const getFileHandle = directory.getFileHandle.bind(directory);
  directory.getFileHandle = async (name, options) => {
    fileLookups++;
    return getFileHandle(name, options);
  };
  assert.equal((await archive.load()).events.length, 10);
  assert.equal((await archive.refresh()).events.length, 10);
  assert.equal(directoryLookups, 2);
  assert.equal(fileLookups, 0);
});

test('loading progress counts event attempts separately from folder entries and unreadable files', async () => {
  const { root, archive } = await fixture();
  await root.put('moments/broken.md', 'not an event');
  await root.put('moments/ignored.md.backup-example', 'backup');
  const reports: ArchiveLoadProgress[] = [];
  const summary = await archive.load(progress => reports.push(progress));
  assert.deepEqual([...new Set(reports.map(report => report.phase))], ['metadata', 'enumerating', 'reading', 'complete']);
  const last = reports.at(-1)!;
  assert.equal(last.entries, 3);
  assert.equal(last.total, 2);
  assert.equal(last.read, 2);
  assert.equal(last.unreadable, 1);
  assert.equal(summary.events.length, 1);
  assert.equal(reports[0].read, 0);
  assert.ok(last.elapsedMs >= last.enumerationMs + last.readingMs);
});

test('edits preserve unknown metadata lines, stable identity, date precision and large label IDs', () => {
  const initial = newEvent();
  const source = initial.source.replace('tags: []', 'tags: [{"id":"9007199254740993","title":"Label","extra":true}]\nunknown: {"id":9007199254740993}');
  const original = parseEvent(initial.filename, source);
  const result = parseEvent(original.filename, editEvent(original, { ...draft(original, 'Changed'), startDate: '2024-02', endDate: null }));
  assert.equal(result.id, original.id);
  assert.equal(result.created, original.created);
  assert.equal(result.startDate, '2024-02');
  assert.ok(result.source.includes('unknown: {"id":9007199254740993}'));
  assert.equal(result.tags[0].extra, true);
  const labels = parseLabels('[{"id":9007199254740993,"title":"Big","unknown":{"n":9007199254740995}}]');
  assert.equal(labelKey(labels[0].id), '9007199254740993');
  assert.equal(String(nextLabelId(labels)), '9007199254740994');
  assert.ok(serialize(labels).includes('9007199254740995'));
});

test('unknown/year/month/day dates and malformed data boundaries', () => {
  for (const value of [null, '2024', '2024-02', '2024-02-29']) validateDate(value);
  for (const value of [undefined, '', '0000', '2023-02-29', '2024-13', '2024-01-32']) assert.throws(() => validateDate(value));
  const original = newEvent();
  assert.throws(() => parseEvent(original.filename, original.source.replace('format_version: 1', 'format_version: 2')));
  assert.throws(() => parseEvent(original.filename, original.source.replace('tags: []', 'tags: []\ntags: []')));
  assert.throws(() => parseLabels('[{"id":1,"title":"A"},{"id":"1","title":"B"}]'));
  assert.throws(() => labelKey(9007199254740992));
  assert.throws(() => parseEvent(original.filename, 'x'.repeat(256 * 1024 + 1)));
});

test('frame resizing matches Android offsets and anchor-relative zoom', () => {
  const frame = { offsetX: 40, offsetY: -20, cropWidth: 400, cropHeight: 300, cropScale: 3 };
  assert.deepEqual(resizedFrame(frame, 200), { ...frame, offsetX: 20, offsetY: -10, cropWidth: 200, cropHeight: 150 });
  const zoom = zoomFrame(frame, 2, 100, 80);
  assert.equal((100 - frame.offsetX) / frame.cropScale, (100 - zoom.offsetX) / zoom.cropScale);
  assert.equal((80 - frame.offsetY) / frame.cropScale, (80 - zoom.offsetY) / zoom.cropScale);
  const initial = defaultFrame(800, 400, 400);
  assert.deepEqual(pictureBounds(initial, 800, 400, 400), { x: -100, y: 0, width: 600, height: 300 });
  assert.throws(() => validateFrame({ ...frame, cropScale: Infinity }));
  assert.throws(() => validateFrame({ ...frame, cropHeight: 200 }));
});

test('stale saves are refused before backups or writes', async () => {
  const { root, archive, original } = await fixture();
  const path = `moments/${original.filename}`;
  await root.put(path, original.source + '\nExternal edit');
  await assert.rejects(archive.updateEvent(original, draft(original, 'Changed')), { code: 'conflict' });
  assert.equal(await root.text(path), original.source + '\nExternal edit');
  assert.equal((await root.getDirectoryHandle('moments')).entries.size, 1);
});

test('replacement and deletion retain verified byte-preserving recovery copies', async () => {
  const { root, archive, original } = await fixture();
  const source = '\uFEFF' + original.source.replaceAll('\n', '\r\n');
  await root.put(`moments/${original.filename}`, source);
  const snapshot = (await archive.load()).events[0];
  const saved = await archive.updateEvent(snapshot, draft(snapshot, 'Changed'));
  assert.equal(await root.text(saved.recoveryPaths[0]), source);
  assert.equal(await root.text(`moments/${original.filename}`), saved.value.source);
  const deleted = await archive.deleteEvent(saved.value);
  assert.equal(await root.text(deleted.recoveryPaths[0]), saved.value.source);
  await assert.rejects(root.text(`moments/${original.filename}`));
});

test('failed backup verification does not touch originals', async () => {
  const { root, archive, original } = await fixture();
  root.control.corrupt = '.backup-';
  await assert.rejects(archive.updateEvent(original, draft(original, 'Changed')), { code: 'verification-failed' });
  assert.equal(await root.text(`moments/${original.filename}`), original.source);
});

test('external edit during backup is detected by the second source check', async () => {
  const { root, archive, original } = await fixture();
  root.control.afterWrite = path => {
    if (path.includes('.backup-')) {
      const folder = root.entries.get('moments') as MemoryFolder;
      const file = folder.entries.get(original.filename)!;
      if ('data' in file) file.data = new TextEncoder().encode('External replacement');
    }
  };
  await assert.rejects(archive.deleteEvent(original), (error: unknown) => {
    assert.ok(error instanceof ArchiveFailure);
    assert.equal(error.code, 'conflict');
    assert.equal(error.recoveryPaths.length, 1);
    return true;
  });
  assert.equal(await root.text(`moments/${original.filename}`), 'External replacement');
});

test('label rename preserves IDs/properties and reports a partial multi-file write', async () => {
  const { root, archive, original } = await fixture();
  await root.put('tags.json', '[{"id":9007199254740993,"title":"Before","custom":true}]\n');
  const source = original.source.replace('tags: []', 'tags: [{"id":"9007199254740993","title":"Before","custom":true}]');
  await root.put(`moments/${original.filename}`, source);
  const snapshot = await archive.load();
  root.control.fail = 'tags.json';
  await assert.rejects(archive.updateLabel(snapshot, '9007199254740993', { title: 'After' }), (error: unknown) => {
    assert.ok(error instanceof ArchiveFailure);
    assert.equal(error.code, 'partial-change');
    assert.equal(error.recoveryPaths.length, 2);
    assert.ok(error.affectedPaths.includes('tags.json'));
    return true;
  });
  assert.ok((await root.text(`moments/${original.filename}`)).includes('"title":"After"'));
  assert.equal(parseLabels(await root.text('tags.json'))[0].title, 'Before');
});

test('failed replacement verification reports the verified recovery copy', async () => {
  const { root, archive, original } = await fixture();
  root.control.corrupt = original.filename;
  await assert.rejects(archive.updateEvent(original, draft(original, 'Changed')), (error: unknown) => {
    assert.ok(error instanceof ArchiveFailure);
    // Corrupting the backup must stop the operation before replacement.
    assert.equal(error.code, 'verification-failed');
    assert.equal(error.recoveryPaths.length, 0);
    return true;
  });
  root.control.corrupt = undefined;
  root.control.afterWrite = path => {
    if (path === `moments/${original.filename}`) {
      const folder = root.entries.get('moments') as MemoryFolder;
      const file = folder.entries.get(original.filename)!;
      if ('data' in file) file.data = new Uint8Array([0]);
    }
  };
  await assert.rejects(archive.updateEvent(original, draft(original, 'Changed')), (error: unknown) => {
    assert.ok(error instanceof ArchiveFailure);
    assert.equal(error.code, 'partial-change');
    assert.equal(error.recoveryPaths.length, 1);
    return true;
  });
});

test('successful label rename/delete preserves unknown properties and leaves attachments alone', async () => {
  const { root, archive, original } = await fixture();
  await root.put('tags.json', '[{"id":9007199254740993,"title":"Before","custom":true}]');
  await root.put(`moments/${original.filename}`, original.source.replace('tags: []', 'tags: [{"id":"9007199254740993","title":"Before","custom":true}]'));
  await root.put('attachments/shared.jpg', 'untouched bytes');
  const snapshot = await archive.load();
  const saved = await archive.updateLabel(snapshot, '9007199254740993', { title: 'After' });
  assert.equal(labelKey(saved.value.id), '9007199254740993');
  assert.equal(saved.value.custom, true);
  const current = await archive.refresh();
  assert.equal(current.events[0].tags[0].title, 'After');
  assert.equal(current.events[0].tags[0].custom, true);
  await archive.deleteLabel(current, '9007199254740993');
  const deleted = await archive.refresh();
  assert.equal(deleted.labels.length, 0);
  assert.equal(deleted.events[0].tags.length, 0);
  assert.equal(await root.text('attachments/shared.jpg'), 'untouched bytes');
});

test('label changes refuse unreadable or externally changed events', async () => {
  const { root, archive } = await fixture();
  await root.put('tags.json', '[{"id":1,"title":"A"}]');
  const snapshot = await archive.load();
  await root.put('moments/broken.md', 'not an event');
  await assert.rejects(archive.deleteLabel(snapshot, '1'), { code: 'invalid-data' });
  assert.equal(await root.text('tags.json'), snapshot.tagsSource);
});

test('nonempty setup folders and overlapping mutations are refused', async () => {
  const { root, archive, original } = await fixture();
  await assert.rejects(archive.initialize(), { code: 'conflict' });
  const saving = archive.updateEvent(original, draft(original, 'Changed'));
  await assert.rejects(archive.deleteEvent(original), { code: 'busy' });
  await saving;
  assert.ok((await root.text(`moments/${original.filename}`)).includes('# Changed'));
});
