import { PICTURE_LIMIT, validateFrame } from './archive-format';
import type { PictureFrame } from './archive-format';
import { ArchiveFailure, requireValue } from './errors';

export type PictureStage = 'decoding' | 'encoding-image' | 'encoding-thumbnail' | 'writing';

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
export async function processPicture(file: Blob, progress?: (stage: PictureStage) => void): Promise<{ image: Blob; thumbnail: Blob }> {
  requireValue(file.size > 0 && file.size <= PICTURE_LIMIT, 'Picture must be nonempty and at most 25 MB', 'limit-exceeded');
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
    return { image, thumbnail: await jpeg(thumbnail, 0.8) };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = thumbnail.width = thumbnail.height = 0;
  }
}

function positive(...values: number[]): void {
  requireValue(values.every(value => Number.isFinite(value) && value > 0), 'Dimensions and scale must be finite and positive');
}

/** Resizes Android view-pixel offsets to the current viewport width without changing relative zoom. */
export function resizedFrame(value: PictureFrame, width: number): PictureFrame {
  const frame = validateFrame(value);
  positive(width);
  const ratio = width / frame.cropWidth;
  return validateFrame({ ...frame, offsetX: frame.offsetX * ratio, offsetY: frame.offsetY * ratio,
    cropWidth: width, cropHeight: width * 3 / 4 });
}

export function defaultFrame(imageWidth: number, imageHeight: number, width: number): PictureFrame {
  positive(imageWidth, imageHeight, width);
  const height = width * 3 / 4;
  const contain = Math.min(width / imageWidth, height / imageHeight);
  const cover = Math.max(width / imageWidth, height / imageHeight);
  return validateFrame({ offsetX: (width - imageWidth * cover) / 2, offsetY: (height - imageHeight * cover) / 2,
    cropWidth: width, cropHeight: height, cropScale: cover / contain });
}

export function zoomFrame(value: PictureFrame, factor: number, x: number, y: number): PictureFrame {
  const frame = validateFrame(value);
  positive(factor);
  requireValue(Number.isFinite(x) && Number.isFinite(y), 'Invalid zoom anchor');
  return validateFrame({ ...frame, offsetX: x - (x - frame.offsetX) * factor,
    offsetY: y - (y - frame.offsetY) * factor, cropScale: frame.cropScale * factor });
}

export function pictureBounds(value: PictureFrame, imageWidth: number, imageHeight: number, viewportWidth: number): { x: number; y: number; width: number; height: number } {
  positive(imageWidth, imageHeight, viewportWidth);
  const frame = resizedFrame(value, viewportWidth);
  const scale = Math.min(frame.cropWidth / imageWidth, frame.cropHeight / imageHeight) * frame.cropScale;
  return { x: frame.offsetX, y: frame.offsetY, width: imageWidth * scale, height: imageHeight * scale };
}
