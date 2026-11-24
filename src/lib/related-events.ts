import { isObject } from './archive-format';
import type { ArchiveEvent, ArchiveSummary } from './archive-format';
import { requireValue } from './errors';

export function relatedEventsTranslated(summary: ArchiveSummary): boolean {
  const web = summary.manifest.limethat_web;
  const migrations = isObject(web) ? web.migrations : undefined;
  const migration = isObject(migrations) ? migrations.related_events_to_tags : undefined;
  return isObject(migration) && typeof migration.completed_at === 'string' && migration.completed_at.length > 0;
}

export function needsRelatedEventsTranslation(summary: ArchiveSummary): boolean {
  return !relatedEventsTranslated(summary) && summary.events.some(event =>
    Array.isArray(event.metadata.related_events) && event.metadata.related_events.length > 0);
}

export function relatedEventGroups(events: ArchiveEvent[]): ArchiveEvent[][] {
  const byId = new Map(events.map(event => [event.id.toLowerCase(), event]));
  const neighbors = new Map(events.map(event => [event.id.toLowerCase(), new Set<string>()]));
  for (const event of events) {
    const related = event.metadata.related_events;
    if (related === undefined) continue;
    requireValue(Array.isArray(related), `Invalid related_events in ${event.filename}`);
    const id = event.id.toLowerCase();
    for (const target of related) {
      requireValue(typeof target === 'string', `Invalid related event ID in ${event.filename}`);
      const key = target.toLowerCase();
      requireValue(byId.has(key), `Missing related event ${target} in ${event.filename}`);
      if (id === key) continue;
      neighbors.get(id)!.add(key);
      neighbors.get(key)!.add(id);
    }
  }
  const seen = new Set<string>();
  const groups: ArchiveEvent[][] = [];
  for (const id of [...byId.keys()].sort()) {
    if (seen.has(id) || !neighbors.get(id)!.size) continue;
    const pending = [id];
    const group: ArchiveEvent[] = [];
    seen.add(id);
    while (pending.length) {
      const current = pending.pop()!;
      group.push(byId.get(current)!);
      for (const target of neighbors.get(current)!) {
        if (seen.has(target)) continue;
        seen.add(target);
        pending.push(target);
      }
    }
    group.sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || a.id.localeCompare(b.id));
    groups.push(group);
  }
  return groups;
}
