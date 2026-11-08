import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyFrameAction, containedFrame, defaultFrame, fitFrame, panZoomFrame,
  pictureBounds, pinchFrame, resizedFrame, validateFrame, zoomFrame,
} from '../src/lib/images/image-frame';
import { Archive } from '../src/lib/archive';
import { labelKey, newEvent, parseEvent, parseLabels } from '../src/lib/archive-format';
import { MemoryFolder } from './memory-folder';

const frame = { offsetX: 25, offsetY: -10, cropWidth: 400, cropHeight: 300, cropScale: 2 };

function near(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-10); }

test('replacement contain and legacy cover defaults for landscape, portrait and square images', () => {
  for (const [iw, ih, containWidth, containHeight] of [[1200, 600, 400, 200], [600, 1200, 150, 300], [600, 600, 300, 300]]) {
    const contained = pictureBounds(containedFrame(400), iw, ih, 400);
    near(contained.x, 0);
    near(contained.y, 0);
    near(contained.width, containWidth);
    near(contained.height, containHeight);
    const cover = pictureBounds(defaultFrame(iw, ih, 400), iw, ih, 400);
    assert.ok(cover.width >= 400 && cover.height >= 300);
    near(cover.x, (400 - cover.width) / 2);
    near(cover.y, (300 - cover.height) / 2);
  }
});

test('resizing is derived, immutable and width-relative, with unknown properties retained', () => {
  const original = Object.freeze({ ...frame, custom: { keep: true } });
  const narrow = resizedFrame(original, 200);
  assert.deepEqual(narrow, { ...original, offsetX: 12.5, offsetY: -5, cropWidth: 200, cropHeight: 150 });
  assert.deepEqual(resizedFrame(narrow, 400), original);
  assert.equal(original.cropWidth, 400);
  assert.equal(original.offsetX, 25);
  assert.notEqual(narrow, original);
});

test('pinch combines centroid pan and anchored scale; rebasing to a single pointer does not jump', () => {
  const pinched = pinchFrame(frame, [{ x: 10, y: 20 }, { x: 110, y: 20 }], [{ x: 40, y: 60 }, { x: 240, y: 60 }]);
  assert.equal(pinched.offsetX, 70);
  assert.equal(pinched.offsetY, 0);
  assert.equal(pinched.cropScale, 4);
  const stationary = panZoomFrame(pinched, { x: 240, y: 60 }, { x: 240, y: 60 }, 1);
  assert.deepEqual(stationary, pinched);
  const dragged = panZoomFrame(pinched, { x: 240, y: 60 }, { x: 250, y: 65 }, 1);
  assert.equal(dragged.offsetX, 80);
  assert.equal(dragged.offsetY, 5);
  assert.equal(dragged.cropScale, 4);
  assert.throws(() => pinchFrame(frame, [{ x: 0, y: 0 }, { x: 0.1, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }]));
  assert.throws(() => pinchFrame(frame, [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 0 }]));
});

test('wheel, keyboard/button zoom and native fit semantics share the geometry', () => {
  const zoomed = zoomFrame(frame, 1.1, 100, 80);
  near((100 - frame.offsetX) / frame.cropScale, (100 - zoomed.offsetX) / zoomed.cropScale);
  near((80 - frame.offsetY) / frame.cropScale, (80 - zoomed.offsetY) / zoomed.cropScale);
  assert.deepEqual(applyFrameAction(frame, 800, 400, 'zoom-in'), zoomFrame(frame, 1.1, 200, 150));
  assert.deepEqual(applyFrameAction(frame, 800, 400, 'reset'), containedFrame(400));
  assert.equal(applyFrameAction(frame, 800, 400, 'left').offsetX, 15);
  const widthFit = fitFrame(frame, 800, 400, 'width');
  assert.equal(widthFit.offsetX, 0);
  assert.equal(widthFit.offsetY, frame.offsetY);
  const heightFit = fitFrame(frame, 800, 400, 'height');
  assert.equal(heightFit.offsetX, frame.offsetX);
  assert.equal(heightFit.offsetY, 0);
  assert.equal(heightFit.cropScale, 1.5);
});

test('rejects nonfinite/invalid frames and Android Float overflow or positive underflow, without product limits', () => {
  for (const value of [Infinity, NaN, 1e39]) assert.throws(() => validateFrame({ ...frame, offsetX: value }));
  for (const value of [0, -1, 1e-50]) assert.throws(() => validateFrame({ ...frame, cropScale: value }));
  assert.throws(() => validateFrame({ ...frame, cropWidth: 0 }));
  assert.throws(() => validateFrame({ ...frame, cropHeight: 200 }));
  assert.throws(() => zoomFrame(frame, 0, 0, 0));
  assert.throws(() => panZoomFrame(frame, { x: NaN, y: 0 }, { x: 0, y: 0 }, 1));
  assert.equal(validateFrame({ ...frame, offsetX: 1e30, cropScale: 1e20 }).cropScale, 1e20);
  assert.equal(validateFrame({ ...frame, cropScale: 1e-30 }).cropScale, 1e-30);
});

test('event and label frame serialization leaves all attachment bytes and untouched frame entries unchanged', async () => {
  const root = new MemoryFolder();
  const archive = new Archive(root.handle());
  await archive.initialize();
  const event = newEvent();
  const original = parseEvent(event.filename, event.source.replace('tags: []', `tags: []\nimage_frames: ${JSON.stringify({ 'hidden.jpg': frame })}`));
  await root.put(`moments/${event.filename}`, original.source);
  await root.put('attachments/image.jpg', 'processed bytes');
  await root.put('attachments/image.jpg.thumb.jpg', 'thumbnail bytes');
  const saved = await archive.updateEvent(original, {
    title: original.title, body: original.body, startDate: original.startDate, endDate: original.endDate, tags: original.tags,
    frames: { ...original.frames, 'image.jpg': zoomFrame(frame, 1.1, 200, 150) },
  });
  assert.equal(saved.value.source.split('\n').filter(line => line.startsWith('image_frames:')).length, 1);
  assert.deepEqual(saved.value.frames['hidden.jpg'], frame);
  assert.deepEqual(parseEvent(event.filename, saved.value.source).frames['image.jpg'], saved.value.frames['image.jpg']);
  const label = await archive.createLabel(await archive.load(), { title: 'Framed', picture: 'attachments/image.jpg', picture_frame: frame });
  const readBack = parseLabels(await root.text('tags.json')).find(value => labelKey(value.id) === labelKey(label.value.id));
  assert.deepEqual(readBack?.picture_frame, frame);
  assert.equal(await root.text('attachments/image.jpg'), 'processed bytes');
  assert.equal(await root.text('attachments/image.jpg.thumb.jpg'), 'thumbnail bytes');
});
