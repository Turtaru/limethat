<script lang="ts">
  import { Button } from '../lib/ui-kit';
  import { useSession } from './session.svelte';
  import { pwa } from './pwa.svelte';
  let { compact = false }: { compact?: boolean } = $props();
  const session = useSession();
  const workspace = session.workspace;
  const busy = $derived(!!workspace.operation || pwa.activating);
  const drafting = $derived(session.draftCount > 0);
</script>
<div class="ui-stack" aria-busy={busy}>
  {#if !compact}<p class="ui-muted">{workspace.archive ? `Archive: ${workspace.archive.root.name}` : 'Choose an existing version-1 archive, or create one in an empty folder. The folder remains the source of truth.'}</p>{/if}
  {#if !workspace.capability.supported}<p class="ui-error">{workspace.capability.message}</p>{/if}
  <div class="ui-cluster">
    {#if workspace.archive}
      <Button disabled={busy} onclick={() => session.refresh()}>Refresh archive</Button>
      <Button disabled={busy || drafting} onclick={() => session.disconnect()}>Close archive</Button>
    {:else}
      <Button disabled={busy || drafting || !workspace.capability.supported} onclick={() => workspace.choose()}>Open archive</Button>
      <Button disabled={busy || drafting || !workspace.capability.supported} onclick={() => workspace.choose(true)}>Create archive</Button>
    {/if}
    {#if workspace.state === 'permission-required'}<Button disabled={busy} onclick={() => workspace.reconnect()}>Reconnect</Button>{/if}
  </div>
  {#if busy}<p class="ui-muted" role="status">{pwa.activating ? 'Updating app' : workspace.operation}…</p>{/if}
  {#if workspace.persistenceWarning}<p class="ui-error">{workspace.persistenceWarning}</p>{/if}
  {#if workspace.error}
    <div class="ui-error" role="alert"><p>{workspace.error.message}</p>
      {#if workspace.error.affectedPaths.length}<p>Possibly affected files:</p><ul>{#each workspace.error.affectedPaths as path}<li><code>{path}</code></li>{/each}</ul>{/if}
      {#if workspace.error.recoveryPaths.length}<p>Verified recovery copies:</p><ul>{#each workspace.error.recoveryPaths as path}<li><code>{path}</code></li>{/each}</ul>{/if}
    </div>
  {/if}
  {#if session.reviewRequired}<p class="ui-error">Changes may be partially complete. Inspect the files and backups, then refresh. Do not repeat this save blindly. Close the affected editor and reopen the current record after review.</p>{/if}
</div>
