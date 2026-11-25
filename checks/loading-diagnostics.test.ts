import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LoadingDiagnostics } from '../src/lib/loading-diagnostics';

test('diagnostics aggregate timing and size samples without storing operation contents', () => {
  const diagnostics = new LoadingDiagnostics();
  diagnostics.record('Text getFile', 10);
  diagnostics.record('Text getFile', 30);
  diagnostics.record('Thumbnail size', 1024, 'bytes');
  diagnostics.increment('Thumbnails found');
  const report = diagnostics.report('example-build');
  assert.ok(report.includes('Build: example-build'));
  assert.ok(report.includes('Text getFile: 2 samples, avg 20.0 ms, max 30.0 ms'));
  assert.ok(report.includes('Thumbnail size: 1 samples, avg 1024.0 bytes, max 1024.0 bytes'));
  assert.ok(report.includes('Thumbnails found: 1'));
});

test('timing preserves return values and failures and records both attempts', async () => {
  const diagnostics = new LoadingDiagnostics();
  assert.equal(await diagnostics.measure('Read', async () => 42), 42);
  const error = new Error('private file contents');
  await assert.rejects(diagnostics.measure('Read', async () => { throw error; }), cause => cause === error);
  const report = diagnostics.report('build');
  assert.ok(report.includes('Read: 2 samples'));
  assert.ok(!report.includes(error.message));
});
