import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Archive, type ThumbnailProgress } from '../src/lib/archive';
import { MemoryFolder } from './memory-folder';

function imagePlatform(t: TestContext) {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const bitmapDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const drawing = { fillStyle: '', fillRect() {}, drawImage() {} };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ width: 0, height: 0, getContext: () => drawing,
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['thumbnail'], { type: 'image/jpeg' })),
    }),
  } });
  Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, value: async (file: Blob) => {
    if (await file.text() === 'broken') throw new Error('Cannot decode');
    return { width: 1600, height: 1200, close() {} };
  } });
  t.after(() => {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
    if (bitmapDescriptor) Object.defineProperty(globalThis, 'createImageBitmap', bitmapDescriptor);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  });
}

test('thumbnail creation preserves originals, skips existing thumbnails, reports failures, and is rerunnable', async t => {
  imagePlatform(t);
  const root = new MemoryFolder();
  const archive = new Archive(root.handle());
  await archive.initialize();
  await root.put('attachments/new.jpg', 'original');
  await root.put('attachments/existing.png', 'original png');
  await root.put('attachments/existing.png.thumb.jpg', 'existing thumbnail');
  await root.put('attachments/broken.jpg', 'broken');
  let last: ThumbnailProgress | undefined;
  await archive.createMissingThumbnails(progress => { last = progress; });
  assert.equal(last!.total, 3);
  assert.equal(last!.processed, 3);
  assert.equal(last!.created, 1);
  assert.equal(last!.skipped, 1);
  assert.equal(last!.failures.length, 1);
  assert.equal(await root.text('attachments/new.jpg'), 'original');
  assert.equal(await root.text('attachments/new.jpg.thumb.jpg'), 'thumbnail');
  assert.equal(await root.text('attachments/existing.png.thumb.jpg'), 'existing thumbnail');
  await archive.createMissingThumbnails(progress => { last = progress; });
  assert.equal(last!.created, 0);
  assert.equal(last!.skipped, 2);
});

test('failed thumbnail verification removes the partial derivative and permits retry', async t => {
  imagePlatform(t);
  const root = new MemoryFolder();
  const archive = new Archive(root.handle());
  await archive.initialize();
  await root.put('attachments/photo.jpg', 'original');
  root.control.corrupt = '.thumb.jpg';
  let last: ThumbnailProgress | undefined;
  await archive.createMissingThumbnails(progress => { last = progress; });
  assert.equal(last!.created, 0);
  assert.equal(last!.failures.length, 1);
  await assert.rejects(root.text('attachments/photo.jpg.thumb.jpg'));
  assert.equal(await root.text('attachments/photo.jpg'), 'original');
  root.control.corrupt = undefined;
  await archive.createMissingThumbnails(progress => { last = progress; });
  assert.equal(last!.created, 1);
});
