<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { DockAction } from '../types';
  import Button from '../ui/Button.svelte';
  import Dialog from '../ui/Dialog.svelte';

  let { open = $bindable(false), src, alt, title = 'Picture', onclose, dock: renderDock }: { open?: boolean; src: string; alt: string; title?: string; onclose?: () => void; dock?: Snippet<[DockAction]> } = $props();
  let stage: HTMLDivElement | undefined = $state();
  let stageWidth = $state(1);
  let stageHeight = $state(1);
  let naturalWidth = $state(1);
  let naturalHeight = $state(1);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let imageError = $state(false);
  const pointers = new Map<number, { x: number; y: number; startX: number; startY: number; moved: boolean }>();
  let lastTap: { x: number; y: number; time: number } | null = null;
  const fit = $derived(Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight));
  const width = $derived(naturalWidth * fit);
  const height = $derived(naturalHeight * fit);
  const maxX = $derived(Math.max(0, (width * zoom - stageWidth) / 2));
  const maxY = $derived(Math.max(0, (height * zoom - stageHeight) / 2));
  const x = $derived(Math.max(-maxX, Math.min(maxX, panX)));
  const y = $derived(Math.max(-maxY, Math.min(maxY, panY)));

  $effect(() => {
    if (open) {
      src;
      zoom = 1;
      panX = panY = 0;
      imageError = false;
      pointers.clear();
      lastTap = null;
    }
  });

  function reset() { zoom = 1; panX = panY = 0; }

  function zoomTo(value: number, pointX = 0, pointY = 0) {
    const next = Math.max(1, Math.min(5, value));
    const ratio = next / zoom;
    panX = pointX - (pointX - x) * ratio;
    panY = pointY - (pointY - y) * ratio;
    zoom = next;
  }

  function point(event: PointerEvent | WheelEvent) {
    const rect = stage!.getBoundingClientRect();
    return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
  }

  function pointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const position = point(event);
    pointers.set(event.pointerId, { ...position, startX: position.x, startY: position.y, moved: false });
    if (pointers.size > 1) {
      lastTap = null;
      for (const pointer of pointers.values()) pointer.moved = true;
    }
    stage?.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const before = [...pointers.values()];
    const position = point(event);
    pointers.set(event.pointerId, { ...previous, ...position, moved: previous.moved || Math.hypot(position.x - previous.startX, position.y - previous.startY) > 8 });
    const after = [...pointers.values()];
    if (after.length === 1) {
      panX = x + position.x - previous.x;
      panY = y + position.y - previous.y;
    } else if (after.length === 2) {
      const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
      const newDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
      const centerX = (before[0].x + before[1].x) / 2;
      const centerY = (before[0].y + before[1].y) / 2;
      if (oldDistance > 0) zoomTo(zoom * newDistance / oldDistance, centerX, centerY);
      panX = x + (after[0].x + after[1].x) / 2 - centerX;
      panY = y + (after[0].y + after[1].y) / 2 - centerY;
    }
  }

  function pointerEnd(event: PointerEvent) {
    const pointer = pointers.get(event.pointerId);
    if (event.type === 'pointerup' && pointer && !pointer.moved && pointers.size === 1) {
      const now = performance.now();
      if (lastTap && now - lastTap.time < 350 && Math.hypot(pointer.x - lastTap.x, pointer.y - lastTap.y) < 30) {
        if (zoom > 1) reset();
        else zoomTo(2.5, pointer.x, pointer.y);
        lastTap = null;
      } else lastTap = { x: pointer.x, y: pointer.y, time: now };
    }
    pointers.delete(event.pointerId);
  }
</script>

<Dialog bind:open {title} variant="viewer" closeLabel="Close" onclose={() => { pointers.clear(); onclose?.(); }}
  onkeydown={(event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') reset(); else zoomTo(zoom * (event.key === '-' ? 1 / 1.5 : 1.5));
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      panX = x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0);
      panY = y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0);
    }
  }}>
  {#snippet actions()}
    <div class="ui-cluster">
      <Button aria-label="Zoom out" disabled={zoom <= 1 || imageError} onclick={() => zoomTo(zoom / 1.5)}>−</Button>
      <Button onclick={reset}>Reset</Button>
      <Button aria-label="Zoom in" disabled={zoom >= 5 || imageError} onclick={() => zoomTo(zoom * 1.5)}>+</Button>
    </div>
  {/snippet}
  {#snippet dock()}{#if renderDock}{@render renderDock({ label: 'Reset picture zoom', icon: 'reset', onclick: reset })}{/if}{/snippet}
  <div class="ui-picture">
    <div bind:this={stage} bind:clientWidth={stageWidth} bind:clientHeight={stageHeight} class="ui-picture__stage" role="group" aria-label="Zoomable picture"
      onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerEnd} onpointercancel={pointerEnd}
      onlostpointercapture={(event) => { pointers.delete(event.pointerId); }}
      onwheel={(event) => { if (event.ctrlKey) return; event.preventDefault(); const position = point(event); zoomTo(zoom * Math.exp(-event.deltaY * .002), position.x, position.y); }}>
      {#if imageError}<p role="alert">Could not load this picture.</p>{/if}
      <img class="ui-picture__image" {src} {alt} draggable="false" hidden={imageError}
        style:width={`${width}px`} style:height={`${height}px`} style:transform={`translate(${x}px, ${y}px) scale(${zoom})`}
        onload={(event) => { const image = event.currentTarget as HTMLImageElement; naturalWidth = image.naturalWidth; naturalHeight = image.naturalHeight; }}
        onerror={() => { imageError = true; }}>
    </div>
    <p class="ui-picture__help">Pinch or scroll to zoom · Drag or arrow keys to pan · +/− zoom · 0 resets · Double-tap to zoom</p>
    <span class="ui-sr-only" role="status">Zoom {Math.round(zoom * 100)} percent</span>
  </div>
</Dialog>
