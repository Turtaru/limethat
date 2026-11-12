<script lang="ts">
  import { Dialog, ImageViewer } from '../lib/ui-kit';
  import AppDock from './AppDock.svelte';
  import { useSession } from './session.svelte';
  const session = useSession();
  let url = $state('');
  let error = $state('');
  $effect(() => {
    const target = session.viewer;
    let active = true;
    let owned = '';
    url = ''; error = '';
    if (target) void session.workspace.readPicture(target.name, false).then(file => {
      if (!active) return;
      owned = URL.createObjectURL(file); url = owned;
    }).catch(cause => { if (active) error = cause instanceof Error ? cause.message : 'Picture unavailable.'; });
    return () => { active = false; if (owned) URL.revokeObjectURL(owned); };
  });
</script>
{#if session.viewer}
  {#if url}<ImageViewer open src={url} alt={session.viewer.alt} onclose={() => { session.viewer = null; }}>{#snippet dock(action)}<AppDock section={session.viewer?.section ?? 'events'} {...action} />{/snippet}</ImageViewer>
  {:else}<Dialog open title="Picture" onclose={() => { session.viewer = null; }}><p class={error ? 'ui-error' : 'ui-muted'}>{error || 'Loading picture…'}</p></Dialog>{/if}
{/if}
