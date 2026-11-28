<script lang="ts">
  import { useSession } from './session.svelte';
  import LoadingDiagnostics from './LoadingDiagnostics.svelte';

  const workspace = useSession().workspace;
  const build = __APP_BUILD__;
  let now = $state(0);
  const progress = $derived(workspace.loadProgress);
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  $effect(() => {
    if (!workspace.operation) return;
    now = performance.now();
    const timer = setInterval(() => { now = performance.now(); }, 1000);
    return () => clearInterval(timer);
  });
</script>

<section class="ui-load-details ui-stack" aria-label="Archive loading details">
  <p class="ui-muted">Build: {build}</p>
  {#if progress}
    <p>{progress.phase === 'metadata' ? 'Reading archive metadata' : progress.phase === 'enumerating' ? 'Listing folder entries' : progress.phase === 'reading' ? `Reading events · ${progress.read} of ${progress.total}` : `Events read · ${progress.read} of ${progress.total}`}{workspace.error ? ' — stopped with an error' : ''}</p>
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
