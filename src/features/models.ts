import { labelKey, photoNames } from '../lib/archive-format';
import type { ArchiveEvent, ArchiveSummary, EventDraft } from '../lib/archive-format';
import type { EventDraft as EditorDraft } from '../lib/ui-kit/types';

export const eventHref = (id: string) => `#/events/${encodeURIComponent(id)}`;
// Keep a legacy string ID named "new" distinct from the creation route.
export const labelHref = (id: string) => `#/labels/${id === 'new' ? '%6Eew' : encodeURIComponent(id)}`;
export const pictureName = (path?: string) => path?.startsWith('attachments/') ? path.slice(12) : undefined;
export function dateLabel(date: string | null): string {
  if (!date) return 'Date unknown';
  if (date.length === 4) return date;
  const exact = date.length === 10;
  return new Intl.DateTimeFormat('en', { timeZone: 'UTC', year: 'numeric', month: 'long', ...(exact ? { day: 'numeric' as const } : {}) })
    .format(new Date(`${exact ? date : `${date}-01`}T12:00:00Z`));
}
export const eventDates = (event: ArchiveEvent) => event.endDate ? `${dateLabel(event.startDate)} – ${dateLabel(event.endDate)}` : dateLabel(event.startDate);
export const monthKey = (event: ArchiveEvent) => event.startDate?.slice(0, 7) ?? 'Undated';
export function timelineGroups(events: ArchiveEvent[]): { month: string; events: ArchiveEvent[] }[] {
  const groups: { month: string; events: ArchiveEvent[] }[] = [];
  for (const event of events) {
    const month = monthKey(event);
    const previous = groups.at(-1);
    if (previous?.month === month) previous.events.push(event);
    else groups.push({ month, events: [event] });
  }
  return groups;
}
export const matchesEvent = (event: ArchiveEvent, query: string) => `${event.title} ${event.body} ${event.tags.map(tag => tag.title).join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
export const description = (body: string) => body
  .replace(/!\[[^\]]*\]\(\.\.\/attachments\/[A-Za-z0-9._-]+\)/g, '')
  .replace(/^## Photos[ \t]*\r?\n(?:[ \t]*\r?\n)*(?=#{1,2} )/gm, '')
  .replace(/(?:^|\n)## Photos\s*$/, '')
  .trim();
export const labelCount = (summary: ArchiveSummary, id: string) => summary.events.filter(event => event.tags.some(tag => tag.id === id)).length;

/** Builds complete archive drafts while retaining unknown embedded-label properties and nonvisible frames. */
export function eventDraft(draft: EditorDraft, original: ArchiveEvent | null, summary: ArchiveSummary, imported: string[]): EventDraft {
  let body = draft.description;
  const removed = new Set(draft.removedPictureIds);
  body = body.replace(/!\[[^\]]*\]\(\.\.\/attachments\/([A-Za-z0-9._-]+)\)/g, (reference, name: string) => removed.has(name) ? '' : reference);
  for (const name of imported) body += `\n\n![Picture](../attachments/${name})`;
  const selected = new Set(draft.labelIds);
  const tags = (original?.tags ?? []).filter(tag => selected.has(tag.id)).map(tag => ({
    ...tag, title: summary.labels.find(label => labelKey(label.id) === tag.id)?.title ?? tag.title,
  }));
  for (const id of selected) {
    if (!tags.some(tag => tag.id === id)) tags.push({ id, title: summary.labels.find(label => labelKey(label.id) === id)?.title ?? id });
  }
  return { title: draft.title, body, startDate: draft.date || null, endDate: draft.endDate || null, tags, frames: { ...original?.frames } };
}

export function editorInitial(original: ArchiveEvent | null) {
  return original ? {
    title: original.title, date: original.startDate ?? '', endDate: original.endDate ?? '', description: original.body,
    labelIds: [...new Set(original.tags.map(tag => tag.id))], pictures: photoNames(original.body).map(name => ({ id: name, name })),
  } : { date: new Date().toLocaleDateString('sv-SE') };
}
