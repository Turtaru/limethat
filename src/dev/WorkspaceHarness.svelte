<script lang="ts">
  import { Workspace } from '../lib/workspace.svelte';

  const workspace = new Workspace();
  window.limethat = workspace;

  async function run(action: () => Promise<unknown>) {
    try { await action(); }
    catch (error) { console.error(error); }
  }
</script>

<section aria-label="Development-only workspace harness">
  <h2>Development harness</h2>
  <p>Unstyled integration controls. Use disposable archives.</p>
  <button disabled={!!workspace.operation} onclick={() => run(() => workspace.choose())}>Open folder</button>
  <button disabled={!!workspace.operation} onclick={() => run(() => workspace.choose(true))}>Create in empty folder</button>
  <button disabled={!!workspace.operation} onclick={() => run(() => workspace.restore())}>Restore remembered folder</button>
  <button disabled={!!workspace.operation} onclick={() => run(() => workspace.reconnect())}>Request permission</button>
  <button disabled={!!workspace.operation || !workspace.archive} onclick={() => run(() => workspace.refresh())}>Refresh</button>
  <p role="status">{workspace.state} / {workspace.operation ?? 'idle'}</p>
  <p>{workspace.capability.message}</p>
  {#if workspace.error}
    <p role="alert">{workspace.error.code}: {workspace.error.message}</p>
    <pre>{JSON.stringify({ affected: workspace.error.affectedPaths, recovery: workspace.error.recoveryPaths }, null, 2)}</pre>
  {/if}
  {#if workspace.persistenceWarning}<p role="alert">{workspace.persistenceWarning}</p>{/if}
  {#if workspace.summary}
    <p>{workspace.summary.events.length} readable events; {workspace.summary.labels.length} labels.</p>
    <pre>{JSON.stringify({ warnings: workspace.summary.warnings, unreadable: workspace.summary.unreadableEvents }, null, 2)}</pre>
  {/if}
  <p>Headless API: <code>window.limethat</code> in the development console.</p>
</section>
