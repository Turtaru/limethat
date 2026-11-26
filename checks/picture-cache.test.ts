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
