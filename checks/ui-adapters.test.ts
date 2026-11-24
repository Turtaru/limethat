import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newEvent, parseLabels, photoNames } from '../src/lib/archive-format';
import type { ArchiveSummary } from '../src/lib/archive-format';
import type { EventDraft } from '../src/lib/ui-kit/types';
import { description, editorInitial, eventDates, eventDraft, labelHref, matchesEvent, timelineGroups } from '../src/features/models';

test('timeline groups preserve event order, partial dates and undated entries without changing the source', () => {
  const dates = ['2026-10-30', '2026-10-12', '2026-09-11', '2025', '2024-02', null, null];
  const events = dates.map(startDate => ({ ...newEvent(), startDate }));
  const groups = timelineGroups(events);
  assert.deepEqual(groups.map(group => group.month), ['2026-10', '2026-09', '2025', '2024-02', 'Undated']);
  assert.deepEqual(groups.map(group => group.events.length), [2, 1, 1, 1, 2]);
  assert.deepEqual(groups.flatMap(group => group.events), events);
  assert.equal(groups[0].events[0], events[0]);
  assert.deepEqual(events.map(event => event.startDate), dates);
  assert.deepEqual(timelineGroups([]), []);
});

test('timeline grouping does not reorder noncontiguous dates', () => {
  const events = ['2026-10-30', '2026-09-11', '2026-10-12'].map(startDate => ({ ...newEvent(), startDate }));
  const groups = timelineGroups(events);
  assert.deepEqual(groups.map(group => group.month), ['2026-10', '2026-09', '2026-10']);
  assert.deepEqual(groups.flatMap(group => group.events), events);
});

function fixture() {
  const original = newEvent();
  original.startDate = '2024';
  original.endDate = '2024-02';
  original.body = 'Keep **Markdown**.\n\n![one](../attachments/one.jpg)\n![two](../attachments/two.jpg)';
  original.tags = [
    { id: '9007199254740993', title: 'Old', extra: { keep: true } },
    { id: 'missing', title: 'Embedded only', custom: 1 },
  ];
  original.frames = { hidden: { offsetX: 1, offsetY: 2, cropWidth: 400, cropHeight: 300, cropScale: 1 } };
  const summary: ArchiveSummary = {
    manifest: {}, tagsSource: '[]', labels: parseLabels('[{"id":9007199254740993,"title":"Renamed"}]'),
    events: [original], warnings: [], unreadableEvents: [],
  };
  const draft: EventDraft = {
    title: original.title, date: '2024', endDate: '2024-02', description: original.body,
    labelIds: original.tags.map(tag => tag.id), pictures: [], removedPictureIds: [],
  };
  return { original, summary, draft };
}

test('complete editor drafts preserve precision, unknown embedded labels and hidden frames', () => {
  const { original, summary, draft } = fixture();
  const result = eventDraft(draft, original, summary, []);
  assert.equal(result.startDate, '2024');
  assert.equal(result.endDate, '2024-02');
  assert.equal(result.body, original.body);
  assert.deepEqual(result.tags[0], { ...original.tags[0], title: 'Renamed' });
  assert.deepEqual(result.tags[1], original.tags[1]);
  assert.deepEqual(result.frames, original.frames);
  assert.notEqual(result.frames, original.frames);
  assert.deepEqual(editorInitial(original).pictures?.map(item => item.id), ['one.jpg', 'two.jpg']);
});

test('picture removal changes references only and imports append without replacing unrelated Markdown', () => {
  const { original, summary, draft } = fixture();
  draft.removedPictureIds = ['one.jpg'];
  const result = eventDraft(draft, original, summary, ['new.jpg']);
  assert.deepEqual(photoNames(result.body), ['two.jpg', 'new.jpg']);
  assert.ok(result.body.startsWith('Keep **Markdown**.'));
  assert.deepEqual(result.frames, original.frames);
  assert.ok(original.body.includes('one.jpg'));
});

test('selection preserves duplicate embedded-tag properties and removes only unselected IDs', () => {
  const { original, summary, draft } = fixture();
  original.tags.push({ ...original.tags[0], another: true });
  draft.labelIds = ['9007199254740993'];
  const result = eventDraft(draft, original, summary, []);
  assert.equal(result.tags.length, 2);
  assert.equal(result.tags[1].another, true);
  assert.ok(result.tags.every(tag => tag.title === 'Renamed'));
});

test('display/search and links do not invent date precision or coerce large IDs', () => {
  const { original } = fixture();
  assert.equal(eventDates(original), '2024 – February 2024');
  assert.equal(labelHref('9007199254740993'), '#/labels/9007199254740993');
  assert.equal(labelHref('new'), '#/labels/%6Eew');
  assert.equal(matchesEvent(original, 'embedded ONLY'), true);
  assert.equal(description(original.body), 'Keep **Markdown**.');
  assert.equal(eventDraft({ title: 'New', date: '', endDate: '', description: '', labelIds: [], pictures: [], removedPictureIds: [] }, null, fixture().summary, []).startDate, null);
});
