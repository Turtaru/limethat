import { PICTURE_LIMIT } from './archive-format';
export { defaultFrame, pictureBounds, resizedFrame, zoomFrame } from './images/image-frame';
import { ArchiveFailure, requireValue } from './errors';

export type PictureStage = 'decoding' | 'encoding-image' | 'encoding-thumbnail' | 'writing';
export type ProcessedPicture = { image: Blob; thumbnail: Blob };

// A draft preview and its later import must use the same oriented JPEG, without encoding it twice.
const processedPictures = new WeakMap<Blob, ProcessedPicture>();

function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob?.type === 'image/jpeg') resolve(blob);
    else reject(new ArchiveFailure('invalid-data', 'JPEG encoding failed'));
  }, 'image/jpeg', quality));
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const result = canvas.getContext('2d');
  requireValue(result, 'Canvas image processing is unavailable', 'unsupported');
  return result;
}

/** Re-encodes the whole image with browser orientation handling; original EXIF and full-resolution bytes are not retained. */
export async function processPicture(file: Blob, progress?: (stage: PictureStage) => void): Promise<ProcessedPicture> {
  requireValue(file.size > 0 && file.size <= PICTURE_LIMIT, 'Picture must be nonempty and at most 25 MB', 'limit-exceeded');
  const prepared = processedPictures.get(file);
  if (prepared) return prepared;
  progress?.('decoding');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const canvas = document.createElement('canvas');
  const thumbnail = document.createElement('canvas');
  try {
    requireValue(bitmap.width > 0 && bitmap.height > 0, 'Image has no pixels');
    const ratio = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.floor(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.floor(bitmap.height * ratio));
    const drawing = context(canvas);
    drawing.fillStyle = 'white';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    progress?.('encoding-image');
    const image = await jpeg(canvas, 0.9);
    const thumbRatio = Math.min(1, 1080 / canvas.width);
    thumbnail.width = Math.max(1, Math.floor(canvas.width * thumbRatio));
    thumbnail.height = Math.max(1, Math.floor(canvas.height * thumbRatio));
    context(thumbnail).drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
    progress?.('encoding-thumbnail');
    const prepared = { image, thumbnail: await jpeg(thumbnail, 0.8) };
    processedPictures.set(file, prepared);
    return prepared;
  } finally {
    bitmap.close();
    canvas.width = canvas.height = thumbnail.width = thumbnail.height = 0;
  }
}
