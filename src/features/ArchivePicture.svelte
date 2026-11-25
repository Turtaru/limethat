<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { eventPhotoTransition, loadedThumbnails } from './event-photo-transition.svelte';
  import { observeVisibility } from '../lib/visibility';
  import { router } from 'svelte-spa-router';
  import ImageFrameViewport from '../lib/images/ImageFrameViewport.svelte';
  import type { PictureFrame } from '../lib/archive-format';
  import { useSession } from './session.svelte';
  import type { LoadingDiagnostics } from '../lib/loading-diagnostics';

  let { name, alt, frame, thumbnail = true, viewable = false, active = true, transitionName, onready }: {
    name: string; alt: string; frame?: PictureFrame; thumbnail?: boolean; viewable?: boolean; active?: boolean; transitionName?: string; onready?: () => void;
  } = $props();
  const session = useSession();
  let handoff = untrack(() => transitionName ? { name, archive: session.workspace.archive, file: eventPhotoTransition.file } : null);
  let host: HTMLDivElement;
  let visible = $state(false);
  let url = $state('');
  let error = $state('');
  let pendingImage: { diagnostics: LoadingDiagnostics; startedAt: number; thumbnail: boolean } | null = null;
  function resourceLoaded() {
    if (!pendingImage) return;
    pendingImage.diagnostics.record(pendingImage.thumbnail ? 'Preview URL-to-load (includes original fallback)' : 'Detail picture URL-to-load', performance.now() - pendingImage.startedAt);
    pendingImage = null;
  }
  onMount(() => observeVisibility(host, intersecting => {
    if (thumbnail || intersecting) visible = intersecting;
  }));
  $effect(() => {
    const archive = session.workspace.archive;
    const source = name;
    if (!active) handoff = null;
    else if (!handoff) handoff = untrack(() => eventPhotoTransition.returning && eventPhotoTransition.name === source
      ? { name: source, archive, file: eventPhotoTransition.file } : null);
    const transferred = handoff?.name === source && handoff.archive === archive ? handoff.file : null;
    const load = active && (!!transferred || visible);
    let current = true;
    let owned = '';
    url = ''; error = '';
    if (archive && load) {
      const show = (file: File) => {
        if (!current) return;
        if (!transferred) pendingImage = { diagnostics: archive.diagnostics, startedAt: performance.now(), thumbnail };
        owned = URL.createObjectURL(file); url = owned;
        if (thumbnail) loadedThumbnails.set(host, file);
      };
      if (transferred) show(transferred);
      else void session.workspace.readPicture(source, thumbnail).then(show)
        .catch(cause => { if (current) error = cause instanceof Error ? cause.message : 'Picture unavailable.'; });
    }
    return () => { current = false; pendingImage = null; loadedThumbnails.delete(host); if (owned) URL.revokeObjectURL(owned); };
  });
</script>

<div bind:this={host} class="ui-archive-picture" data-picture-name={name} class:ui-detail-picture={viewable} style:view-transition-name={transitionName ?? 'none'}>
  {#if url}
    {#if viewable}<button class="ui-photo" type="button" aria-label={`Open picture: ${alt}`} onclick={() => { session.viewer = { name, alt, section: router.location.startsWith('/labels') ? 'labels' : 'events' }; }}><ImageFrameViewport src={url} {alt} {frame} fadeIn={!transitionName} onload={onready} onresourceload={resourceLoaded} /></button>
    {:else}<ImageFrameViewport src={url} {alt} {frame} fadeIn={!transitionName} onload={onready} onresourceload={resourceLoaded} />{/if}
  {:else if error}<p class="ui-error" role="alert">{error}</p>{/if}
</div>
