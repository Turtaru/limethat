import { requireValue } from '../errors';

export interface ImageFrame extends Record<string, unknown> {
  offsetX: number;
  offsetY: number;
  cropWidth: number;
  cropHeight: number;
  cropScale: number;
}
export interface Point { x: number; y: number }
export type FrameAction = 'reset' | 'fit-width' | 'fit-height' | 'left' | 'right' | 'up' | 'down' | 'zoom-in' | 'zoom-out';
export const MIN_PINCH_DISTANCE = 1;

export function validateFrame(value: unknown): ImageFrame {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'Invalid image frame');
  const frame = value as ImageFrame;
  for (const key of ['offsetX', 'offsetY', 'cropWidth', 'cropHeight', 'cropScale'] as const) {
    const n = frame[key];
    requireValue(typeof n === 'number' && Number.isFinite(n) && Number.isFinite(Math.fround(n)), 'Frame numbers must be finite in JavaScript and Android Float');
  }
  for (const key of ['cropWidth', 'cropHeight', 'cropScale'] as const) {
    requireValue(frame[key] > 0 && Math.fround(frame[key]) > 0, 'Frame dimensions and scale must remain positive in Android Float');
  }
  requireValue(Math.abs(frame.cropWidth / frame.cropHeight - 4 / 3) < 0.01 &&
    Math.abs(Math.fround(Math.fround(frame.cropWidth) / Math.fround(frame.cropHeight)) - Math.fround(4 / 3)) < 0.01, 'Invalid 4:3 frame dimensions');
  return { ...frame };
}

function positive(...values: number[]): void {
  requireValue(values.every(value => Number.isFinite(value) && value > 0), 'Dimensions and scale must be finite and positive');
}

/** Resizes Android view-pixel offsets for display; callers persist only after a real edit, never on resize alone. */
export function resizedFrame(value: ImageFrame, width: number): ImageFrame {
  const frame = validateFrame(value);
  positive(width);
  const ratio = width / frame.cropWidth;
  return validateFrame({ ...frame, offsetX: frame.offsetX * ratio, offsetY: frame.offsetY * ratio,
    cropWidth: width, cropHeight: width * 3 / 4 });
}

export function containedFrame(width: number): ImageFrame {
  return validateFrame({ offsetX: 0, offsetY: 0, cropWidth: width, cropHeight: width * 3 / 4, cropScale: 1 });
}

export function defaultFrame(imageWidth: number, imageHeight: number, width: number): ImageFrame {
  positive(imageWidth, imageHeight, width);
  const height = width * 3 / 4;
  const contain = Math.min(width / imageWidth, height / imageHeight);
  const cover = Math.max(width / imageWidth, height / imageHeight);
  return validateFrame({ offsetX: (width - imageWidth * cover) / 2, offsetY: (height - imageHeight * cover) / 2,
    cropWidth: width, cropHeight: height, cropScale: cover / contain });
}

/** Combines centroid translation and anchored zoom, so a pinch can pan and scale in the same movement. */
export function panZoomFrame(value: ImageFrame, from: Point, to: Point, factor: number): ImageFrame {
  const frame = validateFrame(value);
  positive(factor);
  requireValue([from.x, from.y, to.x, to.y].every(Number.isFinite), 'Invalid gesture coordinates');
  return validateFrame({ ...frame, offsetX: to.x - (from.x - frame.offsetX) * factor,
    offsetY: to.y - (from.y - frame.offsetY) * factor, cropScale: frame.cropScale * factor });
}

export function zoomFrame(value: ImageFrame, factor: number, x: number, y: number): ImageFrame {
  return panZoomFrame(value, { x, y }, { x, y }, factor);
}

export function pinchFrame(value: ImageFrame, initial: [Point, Point], current: [Point, Point]): ImageFrame {
  const distance = (points: [Point, Point]) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const center = (points: [Point, Point]): Point => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
  const startDistance = distance(initial);
  requireValue(startDistance >= MIN_PINCH_DISTANCE, 'Separate pointers before starting a pinch');
  return panZoomFrame(value, center(initial), center(current), distance(current) / startDistance);
}

export function fitFrame(value: ImageFrame, imageWidth: number, imageHeight: number, axis: 'width' | 'height'): ImageFrame {
  const frame = validateFrame(value);
  positive(imageWidth, imageHeight);
  const contain = Math.min(frame.cropWidth / imageWidth, frame.cropHeight / imageHeight);
  return validateFrame(axis === 'width'
    ? { ...frame, offsetX: 0, cropScale: frame.cropWidth / (imageWidth * contain) }
    : { ...frame, offsetY: 0, cropScale: frame.cropHeight / (imageHeight * contain) });
}

export function applyFrameAction(value: ImageFrame, imageWidth: number, imageHeight: number, action: FrameAction): ImageFrame {
  const frame = validateFrame(value);
  switch (action) {
    case 'reset': return { ...frame, ...containedFrame(frame.cropWidth) };
    case 'fit-width': return fitFrame(frame, imageWidth, imageHeight, 'width');
    case 'fit-height': return fitFrame(frame, imageWidth, imageHeight, 'height');
    case 'zoom-in': return zoomFrame(frame, 1.1, frame.cropWidth / 2, frame.cropHeight / 2);
    case 'zoom-out': return zoomFrame(frame, 0.9, frame.cropWidth / 2, frame.cropHeight / 2);
    default: {
      const dx = action === 'left' ? -10 : action === 'right' ? 10 : 0;
      const dy = action === 'up' ? -10 : action === 'down' ? 10 : 0;
      return panZoomFrame(frame, { x: 0, y: 0 }, { x: dx, y: dy }, 1);
    }
  }
}

export function pictureBounds(value: ImageFrame, imageWidth: number, imageHeight: number, viewportWidth: number): { x: number; y: number; width: number; height: number } {
  positive(imageWidth, imageHeight, viewportWidth);
  const frame = resizedFrame(value, viewportWidth);
  const scale = Math.min(frame.cropWidth / imageWidth, frame.cropHeight / imageHeight) * frame.cropScale;
  const bounds = { x: frame.offsetX, y: frame.offsetY, width: imageWidth * scale, height: imageHeight * scale };
  requireValue(Object.values(bounds).every(Number.isFinite) && bounds.width > 0 && bounds.height > 0, 'Image display dimensions are not representable');
  return bounds;
}
