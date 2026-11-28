import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ListNavigation } from '../src/features/list-navigation';

test('tab destinations, originating lists and positions have separate ownership', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'history');
  const history = { state: null as Record<string, unknown> | null, replaceState(state: Record<string, unknown>) { this.state = state; } };
  Object.defineProperty(globalThis, 'history', { configurable: true, value: history });
  try {
    const navigation = new ListNavigation();
    navigation.arrive('#/events?q=summer');
    navigation.remember({ url: '#/events?q=summer', y: 300 });
    navigation.remember({ url: '#/labels/family', y: 600 });
    navigation.prepare('#/labels/family', '#/events/one');
    history.state = null;
    navigation.arrive('#/events/one');
    assert.equal(navigation.origin('#/events/one', '#/events'), '#/labels/family');
    assert.equal(navigation.destination('#/events'), '#/events?q=summer');
    assert.equal(navigation.position('#/labels/family')?.y, 600);
    assert.equal(navigation.position('#/events?q=summer')?.y, 300);
    assert.equal(navigation.destination('#/labels'), '#/labels');
  } finally {
    if (original) Object.defineProperty(globalThis, 'history', original);
    else Reflect.deleteProperty(globalThis, 'history');
  }
});

test('history entries restore their own position and origin, not the latest visit to the same URL', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'history');
  const history = { state: null as Record<string, unknown> | null, replaceState(state: Record<string, unknown>) { this.state = state; } };
  Object.defineProperty(globalThis, 'history', { configurable: true, value: history });
  try {
    const navigation = new ListNavigation();
    navigation.prepare('#/labels/family', '#/events/one');
    navigation.arrive('#/events/one');
    navigation.remember({ url: '#/events/one', y: 100 });
    const oldEntry = history.state;
    navigation.prepare('#/events?q=summer', '#/events/one');
    history.state = null;
    navigation.arrive('#/events/one');
    navigation.remember({ url: '#/events/one', y: 500 });
    history.state = null;
    assert.equal(navigation.arrive('#/events/one').position, undefined);
    history.state = oldEntry;
    const restored = navigation.arrive('#/events/one');
    assert.equal(restored.position?.y, 100);
    assert.equal(navigation.origin('#/events/one', '#/events'), '#/labels/family');
    navigation.reset();
    assert.equal(navigation.position('#/events/one'), undefined);
    assert.equal(navigation.arrive('#/events/one').origin, undefined);
    assert.equal(navigation.origin('#/events/one', '#/events'), '#/events');
    assert.equal(navigation.destination('#/events'), '#/events');
  } finally {
    if (original) Object.defineProperty(globalThis, 'history', original);
    else Reflect.deleteProperty(globalThis, 'history');
  }
});

test('search replaces only the current entry and discards its old position', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'history');
  const history = { state: { unrelated: true } as Record<string, unknown>, replaceState(state: Record<string, unknown>) { this.state = state; } };
  Object.defineProperty(globalThis, 'history', { configurable: true, value: history });
  try {
    const navigation = new ListNavigation();
    navigation.remember({ url: '#/events?q=summer', y: 300 });
    navigation.replaceQuery('#/events?q=summer');
    assert.equal(navigation.position('#/events?q=summer'), undefined);
    assert.equal(navigation.destination('#/events'), '#/events?q=summer');
    assert.equal(history.state.unrelated, true);
    navigation.prepare('#/events/new', '#/events/one');
    assert.equal(navigation.arrive('#/events/one').origin, undefined);
    assert.equal(navigation.origin('#/events/one', '#/events'), '#/events?q=summer');
  } finally {
    if (original) Object.defineProperty(globalThis, 'history', original);
    else Reflect.deleteProperty(globalThis, 'history');
  }
});
