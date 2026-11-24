import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Installation } from '../src/features/install';
import type { InstallationState } from '../src/features/install';

function fixture(options: { standalone?: boolean; secure?: boolean; install?: () => Promise<unknown> } = {}) {
  const state: InstallationState = { standalone: false, installed: false, available: false, busy: false, message: '', error: '' };
  const display = Object.assign(new EventTarget(), { matches: options.standalone ?? false });
  const browser = Object.assign(new EventTarget(), {
    isSecureContext: options.secure ?? true,
    matchMedia: () => display as unknown as MediaQueryList,
  });
  const installation = new Installation(state);
  const dispose = installation.watch(browser as unknown as Window, { install: options.install } as unknown as Navigator);
  return { state, display, browser, installation, dispose };
}

function promptEvent(prompt: () => Promise<void>, outcome: 'accepted' | 'dismissed' = 'dismissed') {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
}

test('browser use stays available without an installation mechanism', async () => {
  const { state, installation, dispose } = fixture();
  assert.equal(state.available, false);
  await installation.install();
  assert.equal(state.busy, false);
  assert.equal(state.message, '');
  dispose();
});

test('a deferred prompt runs synchronously from the action and is single-use', async () => {
  const { state, browser, installation, dispose } = fixture();
  let calls = 0;
  const event = promptEvent(async () => { calls++; });
  browser.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(state.available, true);
  const completion = installation.install();
  assert.equal(calls, 1);
  assert.equal(state.busy, true);
  assert.equal(state.available, false);
  await installation.install();
  assert.equal(calls, 1);
  await completion;
  assert.match(state.message, /canceled/);
  await installation.install();
  assert.equal(calls, 1);
  browser.dispatchEvent(promptEvent(async () => { calls++; }, 'accepted'));
  await installation.install();
  assert.equal(calls, 2);
  assert.match(state.message, /accepted/);
  dispose();
});

test('native installation takes priority and cancellation remains retryable', async () => {
  let nativeCalls = 0;
  let promptCalls = 0;
  const { state, browser, installation, dispose } = fixture({ install: async () => {
    nativeCalls++;
    if (nativeCalls === 1) throw new DOMException('Dismissed', 'AbortError');
  } });
  browser.dispatchEvent(promptEvent(async () => { promptCalls++; }));
  const completion = installation.install();
  assert.equal(nativeCalls, 1);
  await completion;
  assert.equal(state.available, true);
  assert.equal(state.error, '');
  await installation.install();
  assert.equal(nativeCalls, 2);
  assert.equal(promptCalls, 0);
  assert.equal(state.available, false);
  assert.match(state.message, /installed or opened/);
  dispose();
});

test('standalone display and appinstalled hide installation without assuming browser-wide detection', () => {
  const { state, browser, display, dispose } = fixture({ standalone: true, install: async () => {} });
  assert.equal(state.standalone, true);
  assert.equal(state.available, false);
  display.matches = false;
  display.dispatchEvent(new Event('change'));
  assert.equal(state.standalone, false);
  assert.equal(state.available, true);
  browser.dispatchEvent(new Event('appinstalled'));
  assert.equal(state.installed, true);
  assert.equal(state.available, false);
  dispose();
});

test('insecure contexts and disposed listeners cannot offer a prompt', () => {
  const insecure = fixture({ secure: false, install: async () => {} });
  insecure.browser.dispatchEvent(promptEvent(async () => {}));
  assert.equal(insecure.state.available, false);
  insecure.dispose();
  const closed = fixture();
  closed.dispose();
  closed.browser.dispatchEvent(promptEvent(async () => {}));
  assert.equal(closed.state.available, false);
});

test('a new prompt received while the previous choice is pending remains available', async () => {
  const { state, browser, installation, dispose } = fixture();
  let resolveChoice!: (choice: { outcome: 'dismissed' }) => void;
  const first = Object.assign(promptEvent(async () => {}), {
    userChoice: new Promise<{ outcome: 'dismissed' }>(resolve => { resolveChoice = resolve; }),
  });
  browser.dispatchEvent(first);
  const completion = installation.install();
  browser.dispatchEvent(promptEvent(async () => {}));
  resolveChoice({ outcome: 'dismissed' });
  await completion;
  assert.equal(state.available, true);
  dispose();
});
