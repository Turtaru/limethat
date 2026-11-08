import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import sharp from 'sharp';

const publicDirectory = new URL('../public/', import.meta.url);

test('manifest and icon URLs resolve inside the repository subpath', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', publicDirectory), 'utf8'));
  const deployedManifest = new URL('https://example.github.io/limethat/manifest.webmanifest');
  for (const field of ['id', 'start_url', 'scope']) {
    assert.equal(new URL(manifest[field], deployedManifest).pathname, '/limethat/');
  }
  for (const icon of manifest.icons) {
    assert.ok(new URL(icon.src, deployedManifest).pathname.startsWith('/limethat/icons/'));
    const image = await readFile(new URL(icon.src, publicDirectory));
    const metadata = await sharp(image).metadata();
    assert.equal(icon.sizes, `${metadata.width}x${metadata.height}`);
    assert.equal(icon.type, 'image/png');
  }
  for (const purpose of ['any', 'maskable']) {
    for (const size of ['192x192', '512x512']) {
      assert.ok(manifest.icons.some((icon: { purpose: string; sizes: string }) => icon.purpose === purpose && icon.sizes === size));
    }
  }
});

test('ICO fallback contains independently decodable 16, 32 and 48 pixel images', async () => {
  const ico = await readFile(new URL('favicon.ico', publicDirectory));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    const length = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);
    const image = await sharp(ico.subarray(offset, offset + length)).metadata();
    assert.equal(image.width, size);
    assert.equal(image.height, size);
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
  }
});

test('lime glyph fits the maskable safe circle', async () => {
  const { data, info } = await sharp(await readFile(new URL('icons/pinned-tab.svg', publicDirectory)))
    .resize(512, 512).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] < 128) continue;
      assert.ok(Math.hypot(x + 0.5 - 256, y + 0.5 - 256) <= 512 * 0.4);
    }
  }
});
