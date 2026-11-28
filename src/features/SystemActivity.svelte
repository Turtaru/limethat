<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { Button, Dialog } from '../lib/ui-kit';
  import { activityProgress, operationMessage, type ActivityIssue } from '../lib/system-activity.svelte';
  import { useSession } from './session.svelte';
  import { installation, pwa } from './pwa.svelte';
  import Connection from './Connection.svelte';

  const session = useSession();
  const workspace = session.workspace;
  const activity = session.activity;
  const busy = $derived(!!workspace.operation || session.pendingSaves.size > 0 || pwa.activating || installation.state.busy);
  const progress = $derived(activityProgress(workspace.operation, workspace.loadProgress, workspace.thumbnailProgress));
  const hasError = $derived(activity.issues.some(issue => issue.level === 'error'));
  const hasWarning = $derived(activity.issues.length > 0);
  const currentMessage = $derived(progress?.message ?? (session.pendingSaves.size ? `Saving ${session.pendingSaves.size} ${session.pendingSaves.size === 1 ? 'change' : 'changes'}…` : pwa.activating ? 'Updating app…' : installation.state.busy ? 'Installing app…' : workspace.operation ? `${operationMessage(workspace.operation)}…` : 'No operations running.'));
  let announcement = $state('');
  let announced = '';
  let updateJob: number | undefined;
  let installJob: number | undefined;
  let heading = $state<HTMLHeadingElement>();

  $effect(() => {
    if (!activity.open || !heading) return;
    const target = heading;
    void tick().then(() => {
      if (!activity.open) return;
      target.focus({ preventScroll: true });
      target.closest('.ui-dialog__body')?.scrollTo({ top: 0, behavior: 'instant' });
    });
  });

  $effect(() => {
    if (pwa.activating && updateJob === undefined) updateJob = untrack(() => activity.add('Updating app', 'info', 'running'));
    else if (!pwa.activating && updateJob !== undefined) {
      const id = updateJob;
      updateJob = undefined;
      untrack(() => activity.finish(id, pwa.error || undefined));
    }
  });

  $effect(() => {
    if (installation.state.busy && installJob === undefined) installJob = untrack(() => activity.add('Installing app', 'info', 'running'));
    else if (!installation.state.busy && installJob !== undefined) {
      const id = installJob;
      installJob = undefined;
      untrack(() => activity.finish(id, installation.state.error || undefined));
    }
  });

  $effect(() => {
    const issues: ActivityIssue[] = [];
    if (workspace.error) issues.push({ key: 'archive', level: 'error', message: workspace.error === session.savedRefreshError ? `Saved, but refreshing failed: ${workspace.error.message}. Refresh or reconnect; do not repeat the save.` : workspace.error.message });
    else if (workspace.state === 'permission-required') issues.push({ key: 'permission', level: 'error', message: 'Archive access needs permission. Reconnect to continue.' });
    if (session.reviewRequired) issues.push({ key: 'review', level: 'error', message: 'Changes may be partially complete. Inspect files and backups, then refresh. Do not repeat the save blindly.' });
    if (workspace.translationRecovery) issues.push({ key: 'migration', level: 'error', message: 'An unfinished migration needs rollback in Settings.', href: '#/settings' });
    for (const [key, message] of session.saveErrors) issues.push({ key: `save:${key}`, level: 'error', message: `Save failed: ${message}. Your draft is preserved.`, href: `#${key}` });
    if (workspace.summary?.unreadableEvents.length) issues.push({ key: 'unreadable', level: 'error', message: `${workspace.summary.unreadableEvents.length} unreadable events are excluded. Label rename/delete is blocked.` });
    if (workspace.thumbnailProgress?.failures.length) issues.push({ key: 'thumbnails', level: 'error', message: `${workspace.thumbnailProgress.failures.length} pictures could not be processed.` });
    if (workspace.persistenceWarning) issues.push({ key: 'persistence', level: 'warning', message: workspace.persistenceWarning });
    if (workspace.snapshotWarning) issues.push({ key: 'snapshot', level: 'warning', message: workspace.snapshotWarning });
    if (workspace.pictureCacheWarning) issues.push({ key: 'pictures', level: 'warning', message: workspace.pictureCacheWarning });
    if (pwa.error) issues.push({ key: 'app', level: 'error', message: pwa.error });
    if (installation.state.error) issues.push({ key: 'installation', level: 'error', message: installation.state.error });
    untrack(() => activity.syncIssues(issues));
  });

  $effect(() => {
    const message = installation.state.message;
    if (message) untrack(() => activity.add(message));
  });

  $effect(() => {
    const latest = activity.entries.at(-1);
    if (!latest) return;
    const key = `${latest.id}:${latest.status}:${latest.message}`;
    if (key !== announced) {
      announced = key;
      announcement = latest.status === 'running' ? '' : latest.status === 'resolved' ? `Resolved: ${latest.message}` : latest.status === 'complete' ? `${latest.message} — complete.` : latest.message;
    }
  });

  $effect.pre(() => {
    if (!busy && !hasWarning && document.activeElement?.classList.contains('ui-activity-button')) {
      document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    }
  });

  function close() {
    if (!document.querySelector('.ui-activity-button') && !document.activeElement?.closest('main')) {
      document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    }
  }
</script>

<div class="ui-sr-only" role="status">{announcement}</div>
{#if busy || hasWarning}
  <div class="ui-activity-anchor">
    <div class="ui-activity-control">
      {#if busy}<progress class="ui-activity-ring" aria-label={progress?.message ?? 'System activity in progress'} max={progress?.total ?? 1} value={progress?.value} style:--activity-progress={`${progress ? Math.min(100, progress.value / progress.total * 100) : 25}%`}></progress>{/if}
      <button class="ui-dock__action ui-activity-button" class:ui-activity-button--error={hasError} class:ui-activity-button--warning={!hasError && hasWarning} type="button" aria-label={hasError ? 'System activity: errors need attention' : hasWarning ? 'System activity: warnings need attention' : busy ? 'System activity in progress' : 'System activity complete'} aria-haspopup="dialog" title="System activity" onclick={() => { activity.open = true; }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{#if hasWarning}<path d="M12 7v6m0 4h.01M12 3 2 21h20L12 3Z" />{:else if busy}<path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" />{:else}<path d="m5 12 4 4L19 6" />{/if}</svg>
      </button>
    </div>
  </div>
{/if}

<Dialog bind:open={activity.open} title="System activity" variant="screen" onclose={close}>
  {#if activity.open}
  <div class="ui-stack">
    <section class="ui-section ui-stack">
      <h3 bind:this={heading} tabindex="-1">Current activity</h3>
      <p>{currentMessage}</p>
      {#if busy}<progress aria-label={progress?.message ?? 'System activity in progress'} max={progress?.total ?? 1} value={progress?.value}></progress>{/if}
      {#if workspace.snapshotStatus}<p class="ui-muted">{workspace.snapshotStatus === 'cached' ? 'Showing cached events while checking the archive.' : 'Building the event index. The list is incomplete.'} Editing stays disabled until verification finishes.</p>{/if}
      {#if session.pendingSaves.size}<p class="ui-muted">You can keep using the app. Keep this tab open until saving finishes.</p><ul>{#each [...session.pendingSaves] as [key, save] (key)}<li>{save.title}</li>{/each}</ul>{/if}
      {#if workspace.thumbnailProgress}
        {@const result = workspace.thumbnailProgress}
        <p>Pictures processed · {result.processed} of {result.total}. {result.created} created, {result.skipped} skipped, {result.failures.length} failed.</p>
        {#if result.failures.length}<ul class="ui-error">{#each result.failures as item}<li><code>{item.path}</code>: {item.message}</li>{/each}</ul>{/if}
      {/if}
    </section>
    {#if activity.issues.length}
      <section class="ui-section ui-stack">
        <h3>Needs attention</h3>
        <ul class="ui-stack">{#each activity.issues as issue (issue.key)}<li><p class={issue.level === 'error' ? 'ui-error' : 'ui-muted'}>{issue.message}</p>{#if issue.href}<a href={issue.href} onclick={() => { activity.open = false; }}>{issue.key.startsWith('save:') ? 'Return to preserved draft' : 'Open Settings'}</a>{/if}</li>{/each}</ul>
        {#if workspace.summary?.unreadableEvents.length}<ul class="ui-error">{#each workspace.summary.unreadableEvents as item}<li><code>{item.path}</code>: {item.message}</li>{/each}</ul>{/if}
      </section>
    {/if}
    <section class="ui-section ui-stack"><h3>Archive connection and recovery</h3><Connection compact /></section>
    <section class="ui-section ui-stack">
      <h3>History</h3>
      <p class="ui-muted">This tab only. Closing or reloading clears history. Progress updates stay in one operation entry.</p>
      <ol class="ui-activity-history">{#each [...activity.entries].reverse() as entry (entry.id)}<li><time datetime={new Date(entry.time).toISOString()}>{new Date(entry.time).toLocaleTimeString()}</time><span class:ui-error={entry.level === 'error' && entry.status !== 'resolved'}>{entry.message}</span><small>{entry.level} · {entry.status}</small></li>{:else}<li>No system messages yet.</li>{/each}</ol>
    </section>
    <Button onclick={() => { activity.open = false; }}>Close system activity</Button>
  </div>
  {/if}
</Dialog>
