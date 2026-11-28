import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PictureCache } from '../src/lib/picture-cache';
import { MemoryFolder } from './memory-folder';

test('cache storage failure falls back to copied folder bytes and deduplicates reads', async () => {
  let reads = 0;
  const source = new File(['image'], 'photo.jpg', { type: 'image/jpeg', lastModified: 12 });
  const cache = new PictureCache(new MemoryFolder().handle(), async () => {
    reads++;
    await new Promise(resolve => setTimeout(resolve, 1));
    return source;
  });
  const results = await Promise.all([cache.load('photo.jpg', true), cache.load('photo.jpg', true)]);
  assert.equal(reads, 1);
  assert.equal(await results[0].file.text(), 'image');
  assert.equal(results[0].file.lastModified, 12);
  assert.notEqual(results[0].file, source);
  assert.ok(cache.warning);
});

test('invalidation notifies mounted consumers by picture and supports cleanup', () => {
  const cache = new PictureCache(new MemoryFolder().handle(), async name => new File([], name));
  let photo = 0;
  let other = 0;
  const unsubscribe = cache.subscribe('photo.jpg', () => photo++);
  cache.subscribe('other.jpg', () => other++);
  cache.invalidate('photo.jpg');
  assert.deepEqual([photo, other], [1, 0]);
  cache.invalidate();
  assert.deepEqual([photo, other], [2, 1]);
  unsubscribe();
  cache.invalidate();
  assert.deepEqual([photo, other], [2, 2]);
});

test('invalidation detaches stale requests without letting their cleanup remove newer work', async () => {
  let startFirst!: () => void;
  let startSecond!: () => void;
  let releaseFirst!: () => void;
  let releaseSecond!: () => void;
  const firstStarted = new Promise<void>(resolve => { startFirst = resolve; });
  const secondStarted = new Promise<void>(resolve => { startSecond = resolve; });
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
  const secondGate = new Promise<void>(resolve => { releaseSecond = resolve; });
  let reads = 0;
  const cache = new PictureCache(new MemoryFolder().handle(), async name => {
    const revision = ++reads;
    if (revision === 1) { startFirst(); await firstGate; }
    else { startSecond(); await secondGate; }
    return new File([String(revision)], name);
  });
  const first = cache.load('photo.jpg', true);
  await firstStarted;
  cache.invalidate();
  const second = cache.load('photo.jpg', true);
  await secondStarted;
  releaseFirst();
  assert.equal(await (await first).file.text(), '1');
  const shared = cache.load('photo.jpg', true);
  releaseSecond();
  const results = await Promise.all([second, shared]);
  assert.equal(reads, 2);
  assert.deepEqual(await Promise.all(results.map(result => result.file.text())), ['2', '2']);
});

test('picture reads use at most two concurrent slots and recover after failures', async () => {
  let active = 0;
  let maximum = 0;
  const cache = new PictureCache(new MemoryFolder().handle(), async name => {
    active++;
    maximum = Math.max(maximum, active);
    try {
      await new Promise(resolve => setTimeout(resolve, 1));
      if (name === 'broken.jpg') throw new Error('Read failed');
      return new File(['image'], name);
    } finally { active--; }
  });
  const results = await Promise.allSettled(['a.jpg', 'broken.jpg', 'c.jpg', 'd.jpg'].map(name => cache.load(name, true)));
  assert.equal(maximum, 2);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
  assert.equal((await cache.load('e.jpg', true)).file.name, 'e.jpg');
});
