<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'svelte-spa-router';
  import ImageFrameViewport from '../lib/images/ImageFrameViewport.svelte';
  import type { PictureFrame } from '../lib/archive-format';
  import { useSession } from './session.svelte';

  let { name, alt, frame, thumbnail = true, viewable = false }: {
    name: string; alt: string; frame?: PictureFrame; thumbnail?: boolean; viewable?: boolean;
  } = $props();
  const session = useSession();
  let host: HTMLDivElement;
  let visible = $state(false);
  let url = $state('');
  let error = $state('');
  onMount(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { visible = true; observer.disconnect(); }
    }, { rootMargin: '300px' });
    observer.observe(host);
    return () => observer.disconnect();
  });
  $effect(() => {
    const archive = session.workspace.archive;
    const source = name;
    const load = visible;
    let active = true;
    let owned = '';
    url = ''; error = '';
    if (archive && load) {
      void session.workspace.readPicture(source, thumbnail).then(file => {
        if (!active) return;
        owned = URL.createObjectURL(file); url = owned;
      }).catch(cause => { if (active) error = cause instanceof Error ? cause.message : 'Picture unavailable.'; });
    }
    return () => { active = false; if (owned) URL.revokeObjectURL(owned); };
  });
</script>

<div bind:this={host} class="ui-archive-picture">
  {#if url}
    {#if viewable}<button class="ui-photo" type="button" aria-label={`Open picture: ${alt}`} onclick={() => { session.viewer = { name, alt, section: router.location.startsWith('/labels') ? 'labels' : 'events' }; }}><ImageFrameViewport src={url} {alt} {frame} /></button>
    {:else}<ImageFrameViewport src={url} {alt} {frame} />{/if}
  {:else}<p class={error ? 'ui-error' : 'ui-muted'}>{error || 'Loading picture…'}</p>{/if}
</div>
