<script lang="ts">
  import ImageFrameViewport from './ImageFrameViewport.svelte';
  import Button from '../ui-kit/ui/Button.svelte';
  import type { ImageFrame } from './image-frame';

  interface Props {
    src?: string;
    alt: string;
    frame?: ImageFrame | null;
    editable?: boolean;
    busy?: boolean;
    error?: string;
    onchange: (frame: ImageFrame) => void;
    onselect?: (file: File) => void;
    onopen?: () => void;
  }
  let { src = '', alt, frame = null, editable = true, busy = false, error = '', onchange, onselect, onopen }: Props = $props();
  let viewport = $state<ImageFrameViewport>();
  let input = $state<HTMLInputElement>();
  let ready = $state(false);
  const inputId = $props.id();
</script>

<div class="ui-frame-input">
  {#if onselect}
    <input bind:this={input} id={inputId} class="ui-sr-only" type="file" accept="image/*" aria-label="Choose picture" tabindex={src ? -1 : 0} disabled={!editable || busy}
      onchange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) onselect?.(file);
        event.currentTarget.value = '';
      }}>
  {/if}
  {#if src}
    <ImageFrameViewport bind:this={viewport} {src} {alt} {frame} editable={editable && !busy} {onchange} {onopen} onreadychange={value => { ready = value; }} />
  {:else if onselect}
    <label class="ui-frame-input__empty" for={inputId} aria-disabled={!editable || busy}>
      {busy ? 'Preparing picture…' : 'Choose an image'}
    </label>
  {/if}
</div>
{#if error}<p class="ui-error" role="alert">{error}</p>{/if}
{#if src}
  <div class="ui-cluster ui-framing-controls">
    <Button disabled={!ready || !editable || busy} onclick={() => viewport?.command('fit-width')}>Fit width</Button>
    <Button disabled={!ready || !editable || busy} onclick={() => viewport?.command('fit-height')}>Fit height</Button>
    {#if onselect}<Button disabled={!editable || busy} onclick={() => input?.click()}>Change image</Button>{/if}
  </div>
{/if}
