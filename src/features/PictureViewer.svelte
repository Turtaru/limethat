<script lang="ts">
  import { onMount } from 'svelte';
  import { Dialog, ImageViewer } from '../lib/ui-kit';
  import AppDock from './AppDock.svelte';
  import { useSession } from './session.svelte';
  const session = useSession();
  let url = $state('');
  let error = $state('');
  // Same-URL entries make the viewer a history layer without asking the hash router to change the detail page.
  let viewerEntry = false;
  onMount(() => {
    const syncHistory = () => {
      const entry = history.state?.limethatPictureViewer as { url: string; picture: NonNullable<typeof session.viewer> } | undefined;
      viewerEntry = !!entry && entry.url === window.location.href;
      session.viewer = viewerEntry ? entry!.picture : null;
    };
    syncHistory();
    window.addEventListener('popstate', syncHistory);
    return () => window.removeEventListener('popstate', syncHistory);
  });
  $effect(() => {
    const picture = session.viewer;
    if (picture) {
      const state = { ...history.state, limethatPictureViewer: {
        url: window.location.href,
        picture: { name: picture.name, alt: picture.alt, section: picture.section },
      } };
      if (viewerEntry) history.replaceState(state, '');
      else history.pushState(state, '');
      viewerEntry = true;
    } else if (viewerEntry) {
      viewerEntry = false;
      if (history.state?.limethatPictureViewer) history.back();
    }
  });
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
