import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newEvent } from '../src/lib/archive-format';
import { activityCounts, activityDays } from '../src/features/activity';

test('year and month grids include every UTC calendar day, including leap days', () => {
  const counts = new Map([['2024-02-29', 3]]);
  const year = activityDays('2024', counts);
  assert.equal(year.length, 366);
  assert.equal(year[0].date, '2024-01-01');
  assert.equal(year.at(-1)?.date, '2024-12-31');
  assert.equal(year.find(day => day.date === '2024-02-29')?.count, 3);
  assert.equal(activityDays('2023', counts).length, 365);
  assert.equal(activityDays('2024-02', counts).length, 29);
  assert.equal(activityDays('2023-02', counts).length, 28);
});

test('activity preserves early/late years and refuses day-level periods', () => {
  assert.equal(activityDays('0001', new Map())[0].date, '0001-01-01');
  assert.equal(activityDays('9999', new Map()).at(-1)?.date, '9999-12-31');
  assert.throws(() => activityDays('2024-02-29', new Map()));
  assert.throws(() => activityDays('2024-13', new Map()));
});

test('counts reflect supplied results without inventing days for partial/unknown dates', () => {
  const original = newEvent();
  const events = ['2024-02-29', '2024-02-29', '2024-03-01', '2024-02', '2024', null]
    .map(startDate => ({ ...original, startDate }));
  assert.deepEqual([...activityCounts(events)], [['2024-02-29', 2], ['2024-03-01', 1]]);
  assert.deepEqual([...activityCounts(events.slice(1, 2))], [['2024-02-29', 1]]);
});
