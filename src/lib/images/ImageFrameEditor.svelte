<script lang="ts">
  import ImageFrameViewport from './ImageFrameViewport.svelte';
  import type { FrameAction, ImageFrame } from './image-frame';

  interface Props {
    src: string;
    alt: string;
    frame?: ImageFrame | null;
    editable?: boolean;
    onchange: (frame: ImageFrame) => void;
    onopen?: () => void;
  }
  let { src, alt, frame = null, editable = true, onchange, onopen }: Props = $props();
  let viewport: ImageFrameViewport;
  let ready = $state(false);
  const controls: { label: string; action: FrameAction }[] = [
    { label: 'Reset / contain', action: 'reset' },
    { label: 'Fit width', action: 'fit-width' },
    { label: 'Fit height', action: 'fit-height' },
    { label: 'Move left', action: 'left' },
    { label: 'Move right', action: 'right' },
    { label: 'Move up', action: 'up' },
    { label: 'Move down', action: 'down' },
    { label: 'Zoom in', action: 'zoom-in' },
    { label: 'Zoom out', action: 'zoom-out' },
  ];
</script>

<ImageFrameViewport bind:this={viewport} {src} {alt} {frame} {editable} {onchange} {onopen} onreadychange={value => { ready = value; }} />
<fieldset disabled={!ready || !editable}>
  <legend>Picture framing</legend>
  {#each controls as control (control.action)}
    <button type="button" onclick={() => viewport.command(control.action)}>{control.label}</button>
  {/each}
</fieldset>
<p>Drag to move; pinch or use the wheel to zoom. With the image viewport focused, arrow keys move and +/− zoom. Buttons provide the same actions.</p>
