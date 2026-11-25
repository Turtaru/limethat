<script lang="ts">
  import { Button } from '../lib/ui-kit';
  import { useSession } from './session.svelte';
  import { pwa } from './pwa.svelte';
  import LoadingDiagnostics from './LoadingDiagnostics.svelte';
  let { compact = false, welcome = false }: { compact?: boolean; welcome?: boolean } = $props();
  const session = useSession();
  const workspace = session.workspace;
  const busy = $derived(!!workspace.operation || pwa.activating);
  const drafting = $derived(session.draftCount > 0);
  const build = __APP_BUILD__;
  let showDetails = $state(false);
  let now = $state(0);
  const progress = $derived(workspace.loadProgress);
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  $effect(() => {
    if (!showDetails || !workspace.operation) return;
    now = performance.now();
    const timer = setInterval(() => { now = performance.now(); }, 1000);
    return () => clearInterval(timer);
  });
</script>
<div class="ui-stack" aria-busy={busy}>
  {#if !compact}<p class="ui-muted">{workspace.archive ? `Archive: ${workspace.archive.root.name}` : 'Choose an existing version-1 archive, or create one in an empty folder. The folder remains the source of truth.'}</p>{/if}
  {#if !workspace.capability.supported}<p class="ui-error">{workspace.capability.message}</p>{/if}
  <div class={welcome ? 'ui-stack' : 'ui-cluster'}>
    {#if workspace.archive}
      <Button disabled={busy} onclick={() => session.refresh()}>Refresh archive</Button>
      <Button disabled={busy || drafting} onclick={() => session.disconnect()}>Close archive</Button>
    {:else if welcome && workspace.capability.supported}
      <Button variant="primary" disabled={busy || drafting} onclick={() => workspace.choose(true)}>Create an archive <span aria-hidden="true">↗</span></Button>
      <Button disabled={busy || drafting} onclick={() => workspace.choose()}>Open existing archive</Button>
    {:else if !welcome}
      <Button disabled={busy || drafting || !workspace.capability.supported} onclick={() => workspace.choose()}>Open archive</Button>
      <Button disabled={busy || drafting || !workspace.capability.supported} onclick={() => workspace.choose(true)}>Create archive</Button>
    {/if}
    {#if workspace.state === 'permission-required'}<Button disabled={busy} onclick={() => workspace.reconnect()}>Reconnect</Button>{/if}
  </div>
  <Button aria-expanded={showDetails} onclick={() => { showDetails = !showDetails; }}>{showDetails ? 'Hide loading details' : 'Show loading details'}</Button>
  {#if showDetails}
    <section class="ui-load-details ui-stack" aria-label="Archive loading details">
      <p class="ui-muted">Build: {build}</p>
      {#if progress}
        <p>{progress.phase === 'metadata' ? 'Reading archive metadata' : progress.phase === 'enumerating' ? 'Listing folder entries' : progress.phase === 'reading' ? `Read ${progress.read}/${progress.total} event files` : `Finished reading ${progress.read}/${progress.total} event files`}{workspace.error ? ' — stopped with an error' : ''}</p>
        <progress aria-label="Event files read" max={Math.max(1, progress.total)} value={progress.phase === 'reading' || progress.phase === 'complete' ? progress.read : undefined}></progress>
        <dl>
          <dt>Elapsed</dt><dd>{seconds(workspace.operation && progress.phase !== 'complete' ? Math.max(progress.elapsedMs, now - progress.startedAt) : progress.elapsedMs)}</dd>
          <dt>Folder entries scanned (including backups)</dt><dd>{progress.entries}</dd>
          <dt>Event files found</dt><dd>{progress.total}{progress.phase === 'enumerating' ? ' (still counting)' : ''}</dd>
          <dt>Folder listing</dt><dd>{seconds(progress.enumerationMs)}</dd>
          <dt>Reading and parsing</dt><dd>{seconds(progress.readingMs)}</dd>
          <dt>Slowest batch (up to 8 files)</dt><dd>{seconds(progress.slowestBatchMs)}</dd>
          <dt>Unreadable event files</dt><dd>{progress.unreadable}</dd>
        </dl>
        <p class="ui-muted">Timings cover archive loading, not list rendering. Take a screenshot here if loading stalls. No file names or contents are shown.</p>
        <LoadingDiagnostics />
      {:else}
        <p class="ui-muted">{workspace.operation ? 'Waiting for folder selection, permission, or archive setup…' : 'Open an archive to see file counts and loading timings.'}</p>
      {/if}
    </section>
  {/if}
  {#if busy}<p class="ui-muted" role="status">{pwa.activating ? 'Updating app' : workspace.operation}…</p>{/if}
  {#if workspace.persistenceWarning}<p class="ui-error">{workspace.persistenceWarning}</p>{/if}
  {#if workspace.error}
    <div class="ui-error" role="alert"><p>{workspace.error.message}</p>
      {#if workspace.error.affectedPaths.length}<p>Possibly affected files:</p><ul>{#each workspace.error.affectedPaths as path}<li><code>{path}</code></li>{/each}</ul>{/if}
      {#if workspace.error.recoveryPaths.length}<p>Verified recovery copies:</p><ul>{#each workspace.error.recoveryPaths as path}<li><code>{path}</code></li>{/each}</ul>{/if}
    </div>
  {/if}
  {#if session.reviewRequired && !workspace.translationRecovery}<p class="ui-error">Changes may be partially complete. Inspect the files and backups, then refresh. Do not repeat this save blindly. Close the affected editor and reopen the current record after review.</p>{/if}
</div>
