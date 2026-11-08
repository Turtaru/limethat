import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const publicDirectory = new URL('../public/', import.meta.url);
const roundLogo = await readFile(new URL('icons/logo.svg', publicDirectory));
const squareLogo = await readFile(new URL('icons/logo-square.svg', publicDirectory));

async function png(source, size) {
  const { data, info } = await sharp(source, { density: 192 })
    .resize(size, size)
    .png()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, size);
  assert.equal(info.height, size);
  return data;
}

async function writePng(source, size, filename) {
  await writeFile(new URL(filename, publicDirectory), await png(source, size));
  console.log(`Generated public/${filename} (${size}×${size})`);
}

async function writeFavicon() {
  const sizes = [16, 32, 48];
  const images = [];
  for (const size of sizes) images.push(await png(roundLogo, size));

  // ICO directory entries point to embedded PNG images, retaining transparency at each size.
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (const [index, image] of images.entries()) {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  }
  const icon = Buffer.concat([header, ...images]);
  assert.equal(icon.length, offset);
  await writeFile(new URL('favicon.ico', publicDirectory), icon);
  console.log('Generated public/favicon.ico (16, 32, 48)');
}

async function writePinnedTab() {
  const glyphs = roundLogo.toString('utf8').match(/<path fill="#fff"[^>]*\/>/g);
  assert.equal(glyphs?.length, 1, 'Expected one white lime glyph in icons/logo.svg');
  const glyph = glyphs[0].replaceAll('#fff', '#000');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1400">\n  ${glyph}\n</svg>\n`;
  await writeFile(new URL('icons/pinned-tab.svg', publicDirectory), svg);
  console.log('Generated public/icons/pinned-tab.svg');
}

await writePng(roundLogo, 192, 'icons/icon-192.png');
await writePng(roundLogo, 512, 'icons/icon-512.png');
await writePng(squareLogo, 192, 'icons/maskable-192.png');
await writePng(squareLogo, 512, 'icons/maskable-512.png');
await writePng(squareLogo, 180, 'icons/apple-touch-icon.png');
await writeFavicon();
await writePinnedTab();
