import { validateDate } from '../lib/archive-format';
import type { ArchiveEvent } from '../lib/archive-format';

/** Counts exact calendar days without assigning invented days to legacy year/month-only dates. */
export function activityCounts(events: ArchiveEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.startDate?.length === 10) counts.set(event.startDate, (counts.get(event.startDate) ?? 0) + 1);
  }
  return counts;
}

export function activityDays(period: string, counts: ReadonlyMap<string, number>): { date: string; count: number }[] {
  validateDate(period);
  if (period.length !== 4 && period.length !== 7) throw new Error('Activity period must be YYYY or YYYY-MM');
  const start = new Date(`${period.length === 4 ? `${period}-01` : period}-01T00:00:00Z`);
  const end = new Date(start);
  if (period.length === 4) end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  const days = (end.getTime() - start.getTime()) / 86400000;
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
    return { date, count: counts.get(date) ?? 0 };
  });
}
