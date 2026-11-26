import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listSelector, restoreListPosition } from '../src/features/list-position';

test('all event and label list routes share scroll restoration, excluding editors', () => {
  for (const path of ['/', '/events', '/labels/family', '/labels/123']) {
    assert.equal(listSelector(path), '.ui-timeline > li');
  }
  assert.equal(listSelector('/labels'), '.ui-label-list > li');
  for (const path of ['/events/new', '/events/123', '/labels/new', '/labels/123/edit', '/settings']) {
    assert.equal(listSelector(path), null);
  }
});

test('remounted tag lists restore by link when generated item IDs change', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const calls: unknown[] = [];
  const item = { getBoundingClientRect: () => ({ top: 500 }) };
  const link = { getAttribute: () => '#/events/123', closest: (selector: string) => selector === '[inert]' ? null : item };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    scrollY: 100, scrollX: 0, scrollTo: (options: unknown) => calls.push(options),
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    getElementById: () => null, querySelectorAll: () => [link],
  } });
  try {
    assert.equal(restoreListPosition({ url: '#/labels/family', y: 900, eventId: 'old-id', itemHref: '#/events/123', offset: 150 }), item);
    assert.deepEqual(calls, [{ left: 0, top: 450, behavior: 'instant' }]);
    restoreListPosition({ url: '#/labels/empty', y: 200 });
    assert.deepEqual(calls[1], { left: 0, top: 200, behavior: 'instant' });
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
