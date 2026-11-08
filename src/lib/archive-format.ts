import { LosslessNumber, isLosslessNumber, parse, stringify } from 'lossless-json';
import { ArchiveFailure, requireValue } from './errors';

export const TEXT_LIMIT = 256 * 1024;
export const PICTURE_LIMIT = 25 * 1024 * 1024;
export type JsonObject = Record<string, unknown>;
export type LabelId = string | number | LosslessNumber;
export interface PictureFrame extends JsonObject {
  offsetX: number;
  offsetY: number;
  cropWidth: number;
  cropHeight: number;
  cropScale: number;
}
export interface EventLabel extends JsonObject { id: string; title: string }
export interface Label extends JsonObject {
  id: LabelId;
  title: string;
  picture?: string;
  picture_frame?: PictureFrame;
}
export interface ArchiveEvent {
  filename: string;
  source: string;
  lines: string[];
  end: number;
  heading: number;
  metadata: JsonObject;
  id: string;
  created: string;
  startDate: string | null;
  endDate: string | null;
  tags: EventLabel[];
  frames: Record<string, PictureFrame>;
  title: string;
  body: string;
}
export interface EventDraft {
  title: string;
  body: string;
  startDate: string | null;
  endDate: string | null;
  tags: EventLabel[];
  frames: Record<string, PictureFrame>;
}
export interface ArchiveSummary {
  manifest: JsonObject;
  tagsSource: string;
  labels: Label[];
  events: ArchiveEvent[];
  unreadableEvents: { path: string; message: string }[];
  warnings: string[];
}

export const safeName = (name: string): boolean => /^[A-Za-z0-9._-]+$/.test(name) && name !== '.' && name !== '..';
export const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !isLosslessNumber(value);

export function json(text: string): unknown {
  try { return parse(text.replace(/^\uFEFF/, '')); }
  catch (cause) { throw new ArchiveFailure('invalid-data', 'Invalid JSON data', [], [], { cause }); }
}

export function serialize(value: unknown, indent?: number): string {
  const text = stringify(value, undefined, indent);
  requireValue(typeof text === 'string', 'Value cannot be serialized');
  return text;
}

export function validateText(text: string): void {
  requireValue(new TextEncoder().encode(text).length <= TEXT_LIMIT, 'Text exceeds 256 KB', 'limit-exceeded');
}

export function labelKey(id: unknown): string {
  requireValue(typeof id === 'string' || isLosslessNumber(id) ||
    (typeof id === 'number' && Number.isSafeInteger(id)), 'Invalid or unsafe label ID');
  const key = String(id);
  requireValue(key.length > 0, 'Empty label ID');
  if (typeof id !== 'string') requireValue(/^-?\d+$/.test(key), 'Numeric label IDs must be integers');
  return key;
}

export function validateFrame(value: unknown): PictureFrame {
  requireValue(isObject(value), 'Invalid image frame');
  const result = { ...value };
  for (const key of ['offsetX', 'offsetY', 'cropWidth', 'cropHeight', 'cropScale']) {
    const n = isLosslessNumber(value[key]) ? Number(String(value[key])) : value[key];
    requireValue(typeof n === 'number' && Number.isFinite(n), 'Invalid frame numbers');
    result[key] = n;
  }
  const frame = result as PictureFrame;
  requireValue(frame.cropWidth > 0 && frame.cropHeight > 0 && frame.cropScale > 0 &&
    Math.abs(frame.cropWidth / frame.cropHeight - 4 / 3) < 0.01, 'Invalid 4:3 frame dimensions');
  return frame;
}

export function validateDate(value: unknown): asserts value is string | null {
  if (value === null) return;
  requireValue(typeof value === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value), 'Use null, YYYY, YYYY-MM or YYYY-MM-DD');
  const [year, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  requireValue(year >= 1 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day, 'Invalid calendar date');
}

export function parseManifest(source: string): JsonObject {
  validateText(source);
  const value = json(source);
  requireValue(isObject(value), 'Invalid manifest.json');
  requireValue(typeof value.format_version !== 'string' && String(value.format_version) === '1', 'Unsupported archive version', 'unsupported-version');
  return value;
}

export function parseLabels(source: string): Label[] {
  validateText(source);
  const values = json(source);
  requireValue(Array.isArray(values), 'tags.json must contain an array');
  const ids = new Set<string>();
  return values.map(value => {
    requireValue(isObject(value), 'Invalid label');
    const id = labelKey(value.id);
    requireValue(!ids.has(id), `Duplicate label ID: ${id}`);
    ids.add(id);
    requireValue(typeof value.title === 'string' && value.title.trim(), 'Invalid label title');
    if (value.picture !== undefined) requireValue(typeof value.picture === 'string' &&
      value.picture.startsWith('attachments/') && safeName(value.picture.slice('attachments/'.length)), 'Invalid label picture');
    return { ...value, ...(value.picture_frame !== undefined ? { picture_frame: validateFrame(value.picture_frame) } : {}) } as Label;
  });
}

export function parseEvent(filename: string, source: string): ArchiveEvent {
  requireValue(safeName(filename) && filename.endsWith('.md'), 'Invalid event filename');
  validateText(source);
  const lines = source.replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').split('\n');
  requireValue(lines[0] === '---', 'Missing front matter');
  const end = lines.indexOf('---', 1);
  requireValue(end > 0, 'Unclosed front matter');
  const metadata: JsonObject = Object.create(null);
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    const key = line.slice(0, colon).trim();
    requireValue(colon > 0 && key.length && !Object.hasOwn(metadata, key), 'Invalid or duplicate metadata');
    metadata[key] = json(line.slice(colon + 1).trim());
  }
  requireValue(typeof metadata.format_version !== 'string' && String(metadata.format_version) === '1', 'Unsupported event version', 'unsupported-version');
  requireValue(typeof metadata.id === 'string' && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(metadata.id), 'Invalid event UUID');
  requireValue(typeof metadata.created === 'string' && metadata.created.trim(), 'Missing creation timestamp');
  validateDate(metadata.start_date);
  validateDate(metadata.end_date);
  requireValue(Array.isArray(metadata.tags) && metadata.tags.every(tag => isObject(tag) &&
    typeof tag.id === 'string' && tag.id.length && typeof tag.title === 'string'), 'Invalid event labels');
  const frames: Record<string, PictureFrame> = {};
  if (metadata.image_frames !== undefined) {
    requireValue(isObject(metadata.image_frames), 'Invalid image_frames');
    for (const [name, frame] of Object.entries(metadata.image_frames)) {
      requireValue(safeName(name), 'Invalid framed image name');
      Object.defineProperty(frames, name, { value: validateFrame(frame), enumerable: true, writable: true, configurable: true });
    }
  }
  const heading = lines.findIndex((line, index) => index > end && line.startsWith('# '));
  requireValue(heading > end && lines[heading].slice(2).trim(), 'Missing title heading');
  return { filename, source, lines, end, heading, metadata, frames,
    id: metadata.id, created: metadata.created, startDate: metadata.start_date, endDate: metadata.end_date,
    tags: metadata.tags as EventLabel[], title: lines[heading].slice(2).trim(), body: lines.slice(heading + 1).join('\n').trim() };
}

/** Changes selected front-matter lines; unknown lines and their JSON representations remain untouched. */
export function updateMetadata(event: ArchiveEvent, values: JsonObject): string {
  const updates = new Map(Object.entries(values));
  const lines = event.lines.slice(0, event.end).map((line, index) => {
    const key = line.slice(0, line.indexOf(':')).trim();
    if (index && updates.has(key)) {
      const value = updates.get(key);
      updates.delete(key);
      return `${key}: ${serialize(value)}`;
    }
    return line;
  });
  for (const [key, value] of updates) lines.push(`${key}: ${serialize(value)}`);
  const text = [...lines, ...event.lines.slice(event.end)].join('\n');
  parseEvent(event.filename, text);
  return text;
}

export function editEvent(event: ArchiveEvent, draft: EventDraft): string {
  requireValue(typeof draft.title === 'string' && draft.title.trim() && !/[\r\n]/.test(draft.title), 'Enter a title on one line');
  requireValue(typeof draft.body === 'string', 'Invalid event body');
  const updated = parseEvent(event.filename, updateMetadata(event, {
    start_date: draft.startDate, end_date: draft.endDate, tags: draft.tags, image_frames: draft.frames,
  }));
  const text = [...updated.lines.slice(0, updated.heading), `# ${draft.title.trim()}`, '', draft.body.trim(), ''].join('\n');
  parseEvent(event.filename, text);
  return text;
}

export function newEvent(): ArchiveEvent {
  const id = crypto.randomUUID();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return parseEvent(`${today}-${id}.md`, `---\nformat_version: 1\nid: "${id}"\ncreated: "${now.toISOString()}"\nstart_date: "${today}"\nend_date: null\ntags: []\n---\n\n# New event\n\n`);
}

export function nextLabelId(labels: Label[]): LosslessNumber {
  let highest = 0n;
  for (const label of labels) {
    const id = labelKey(label.id);
    requireValue(/^-?\d+$/.test(id), 'Cannot allocate an Android numeric label ID from nonnumeric IDs');
    const value = BigInt(id);
    if (value > highest) highest = value;
  }
  requireValue(highest < 9223372036854775807n, 'Android label ID range exhausted');
  return new LosslessNumber(String(highest + 1n));
}

export function photoNames(body: string): string[] {
  return [...new Set([...body.matchAll(/!\[[^\]]*\]\(\.\.\/attachments\/([A-Za-z0-9._-]+)\)/g)]
    .map(match => match[1]).filter(safeName))];
}
