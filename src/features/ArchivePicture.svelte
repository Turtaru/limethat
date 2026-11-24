<script lang="ts">
  import { onMount } from 'svelte';
  import { observeVisibility } from '../lib/visibility';
  import { router } from 'svelte-spa-router';
  import ImageFrameViewport from '../lib/images/ImageFrameViewport.svelte';
  import type { PictureFrame } from '../lib/archive-format';
  import { useSession } from './session.svelte';

  let { name, alt, frame, thumbnail = true, viewable = false, active = true }: {
    name: string; alt: string; frame?: PictureFrame; thumbnail?: boolean; viewable?: boolean; active?: boolean;
  } = $props();
  const session = useSession();
  let host: HTMLDivElement;
  let visible = $state(false);
  let url = $state('');
  let error = $state('');
  onMount(() => observeVisibility(host, intersecting => {
    if (thumbnail || intersecting) visible = intersecting;
  }));
  $effect(() => {
    const archive = session.workspace.archive;
    const source = name;
    const load = visible && active;
    let current = true;
    let owned = '';
    url = ''; error = '';
    if (archive && load) {
      void session.workspace.readPicture(source, thumbnail).then(file => {
        if (!current) return;
        owned = URL.createObjectURL(file); url = owned;
      }).catch(cause => { if (current) error = cause instanceof Error ? cause.message : 'Picture unavailable.'; });
    }
    return () => { current = false; if (owned) URL.revokeObjectURL(owned); };
  });
</script>

<div bind:this={host} class="ui-archive-picture" class:ui-detail-picture={viewable}>
  {#if url}
    {#if viewable}<button class="ui-photo" type="button" aria-label={`Open picture: ${alt}`} onclick={() => { session.viewer = { name, alt, section: router.location.startsWith('/labels') ? 'labels' : 'events' }; }}><ImageFrameViewport src={url} {alt} {frame} fadeIn /></button>
    {:else}<ImageFrameViewport src={url} {alt} {frame} fadeIn />{/if}
  {:else if error}<p class="ui-error" role="alert">{error}</p>{/if}
</div>
