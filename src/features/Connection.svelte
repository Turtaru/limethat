<script lang="ts">
  import { Button } from '../lib/ui-kit';
  import { useSession } from './session.svelte';
  import { pwa } from './pwa.svelte';
  import LoadingDetails from './LoadingDetails.svelte';
  let { compact = false, welcome = false }: { compact?: boolean; welcome?: boolean } = $props();
  const session = useSession();
  const workspace = session.workspace;
  const busy = $derived(!!workspace.operation || session.pendingSaves.size > 0 || pwa.activating);
  const drafting = $derived(session.draftCount > 0);
  let showDetails = $state(false);
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
  {#if !welcome}
    <Button aria-expanded={showDetails} onclick={() => { showDetails = !showDetails; }}>{showDetails ? 'Hide loading details' : 'Show loading details'}</Button>
    {#if showDetails}<LoadingDetails />{/if}
  {/if}
  {#if workspace.snapshotWarning}<p class="ui-error" role="status">{workspace.snapshotWarning}</p>{/if}
  {#if workspace.persistenceWarning}<p class="ui-error">{workspace.persistenceWarning}</p>{/if}
  {#if workspace.error}
    <div class="ui-error" role="alert"><p>{workspace.error.message}</p>
      {#if workspace.error.affectedPaths.length}<p>Possibly affected files:</p><ul>{#each workspace.error.affectedPaths as path}<li><code>{path}</code></li>{/each}</ul>{/if}
      {#if workspace.error.recoveryPaths.length}<p>Verified recovery copies:</p><ul>{#each workspace.error.recoveryPaths as path}<li><code>{path}</code></li>{/each}</ul>{/if}
    </div>
  {/if}
  {#if session.reviewRequired && !workspace.translationRecovery}<p class="ui-error">Changes may be partially complete. Inspect the files and backups, then refresh. Do not repeat this save blindly. Close the affected editor and reopen the current record after review.</p>{/if}
</div>
