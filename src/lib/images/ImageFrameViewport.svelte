<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { on } from 'svelte/events';
  import {
    MIN_PINCH_DISTANCE, applyFrameAction, defaultFrame, panZoomFrame, pictureBounds,
    pinchFrame, resizedFrame, validateFrame, zoomFrame,
  } from './image-frame';
  import type { FrameAction, ImageFrame, Point } from './image-frame';

  interface Props {
    src: string;
    alt: string;
    frame?: ImageFrame | null;
    editable?: boolean;
    fadeIn?: boolean;
    onchange?: (frame: ImageFrame) => void;
    onopen?: () => void;
    onreadychange?: (ready: boolean) => void;
  }
  let { src, alt, frame = null, editable = false, fadeIn = false, onchange, onopen, onreadychange }: Props = $props();
  let viewport: HTMLDivElement;
  let image = $state<HTMLImageElement>();
  let width = $state(0);
  let resource = $state.raw<{ src: string; element: HTMLImageElement; width: number; height: number; error?: string } | null>(null);
  let gestureOutput = $state.raw<ImageFrame | null>(null);
  let inputError = $state<string | null>(null);
  const pointers = new Map<number, Point>();
  let baseline: { frame: ImageFrame; ids: number[]; points: Point[] } | null = null;
  let lastEmitted: ImageFrame | null = null;

  const currentResource = $derived(resource?.src === src && resource.element === image ? resource : null);
  const dimensions = $derived(currentResource && !currentResource.error ? currentResource : null);
  const geometry = $derived.by(() => {
    try {
      const persisted = frame == null ? null : validateFrame(frame);
      if (!dimensions || width <= 0) return { current: null, bounds: null, error: null };
      const current = gestureOutput ? resizedFrame(gestureOutput, width)
        : persisted ? resizedFrame(persisted, width) : defaultFrame(dimensions.width, dimensions.height, width);
      return { current, bounds: pictureBounds(current, dimensions.width, dimensions.height, width), error: null };
    } catch (error) {
      return { current: null, bounds: null, error: error instanceof Error ? error.message : 'Invalid framing metadata' };
    }
  });
  const canEdit = $derived(editable && !!onchange && !!geometry.current);
  const problem = $derived(currentResource?.error ?? geometry.error ?? inputError);

  function sameFrame(a: ImageFrame | null | undefined, b: ImageFrame | null | undefined): boolean {
    if (!a || !b) return a == null && b == null;
    return (['offsetX', 'offsetY', 'cropWidth', 'cropHeight', 'cropScale'] as const).every(key => a[key] === b[key]);
  }

  function release(id: number) {
    try { if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id); }
    catch { /* The element or pointer may already be detached. */ }
  }

  function cancelGesture() {
    const ids = [...pointers.keys()];
    pointers.clear();
    baseline = null;
    gestureOutput = null;
    for (const id of ids) release(id);
  }

  $effect(() => {
    src;
    editable;
    untrack(() => { cancelGesture(); inputError = null; });
  });
  $effect(() => {
    const incoming = frame;
    untrack(() => {
      // Parent acknowledgements keep the gesture baseline; external draft resets cancel it.
      if (pointers.size && !sameFrame(incoming, lastEmitted)) cancelGesture();
    });
  });
  $effect(() => {
    onreadychange?.(canEdit);
    if (!canEdit) untrack(cancelGesture);
  });

  $effect(() => {
    if (editable) return on(viewport, 'wheel', wheel, { passive: false });
  });

  onMount(() => {
    const resize = (next: number) => {
      if (next === width) return;
      cancelGesture();
      width = next;
    };
    resize(viewport.clientWidth);
    const observer = new ResizeObserver(entries => resize(entries[0].contentRect.width));
    observer.observe(viewport);
    return () => { observer.disconnect(); cancelGesture(); };
  });

  function loaded(event: Event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLImageElement) || target !== image) return;
    const { naturalWidth, naturalHeight } = target;
    if (naturalWidth <= 0 || naturalHeight <= 0) { failedImage(event); return; }
    cancelGesture();
    resource = { src, element: target, width: naturalWidth, height: naturalHeight };
    inputError = null;
  }

  function failedImage(event: Event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLImageElement) || target !== image) return;
    cancelGesture();
    resource = { src, element: target, width: 0, height: 0, error: 'Image could not be loaded. Reopen it or choose another image.' };
  }

  function localPoint(event: { clientX: number; clientY: number }): Point {
    const rect = viewport.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * width / rect.width,
      y: (event.clientY - rect.top) * (width * 3 / 4) / rect.height };
  }

  function rebase(current = geometry.current) {
    baseline = current && pointers.size ? {
      frame: current, ids: [...pointers.keys()], points: [...pointers.values()],
    } : null;
    if (!pointers.size) gestureOutput = null;
  }

  function emit(next: ImageFrame, gesturing = false): boolean {
    const value = validateFrame(next);
    if (sameFrame(value, geometry.current)) return false;
    if (gesturing) gestureOutput = value;
    lastEmitted = value;
    inputError = null;
    onchange?.(value);
    return true;
  }

  function pointerDown(event: PointerEvent) {
    if (!canEdit || event.button !== 0 || pointers.has(event.pointerId) || pointers.size >= 2) return;
    viewport.focus({ preventScroll: true });
    try { viewport.setPointerCapture(event.pointerId); }
    catch { inputError = 'Pointer capture is unavailable. Use the keyboard or framing buttons.'; return; }
    if (!pointers.size) lastEmitted = frame;
    pointers.set(event.pointerId, localPoint(event));
    rebase();
  }

  function pointerMove(event: PointerEvent) {
    if (!canEdit || !pointers.has(event.pointerId) || !baseline) return;
    pointers.set(event.pointerId, localPoint(event));
    const current = baseline.ids.map(id => pointers.get(id)!);
    try {
      if (current.length === 1) {
        emit(panZoomFrame(baseline.frame, baseline.points[0], current[0], 1), true);
      } else {
        const [a, b] = baseline.points;
        if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_PINCH_DISTANCE) { rebase(); return; }
        if (current[0].x === current[1].x && current[0].y === current[1].y) return;
        emit(pinchFrame(baseline.frame, baseline.points as [Point, Point], current as [Point, Point]), true);
      }
    } catch (error) { inputError = error instanceof Error ? error.message : 'Framing change is not representable'; }
  }

  function pointerEnd(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    if (event.type === 'pointerup') pointerMove(event);
    const current = geometry.current;
    pointers.delete(event.pointerId);
    release(event.pointerId);
    rebase(current);
  }

  export function command(action: FrameAction) {
    if (!canEdit || !geometry.current || !dimensions) return;
    const current = geometry.current;
    cancelGesture();
    try { emit(applyFrameAction(current, dimensions.width, dimensions.height, action)); }
    catch (error) { inputError = error instanceof Error ? error.message : 'Framing change is not representable'; }
  }

  function keyboard(event: KeyboardEvent) {
    if (!canEdit || event.target !== viewport || event.altKey || event.ctrlKey || event.metaKey) return;
    const keys: Record<string, FrameAction> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      '+': 'zoom-in', '=': 'zoom-in', '-': 'zoom-out',
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    command(action);
  }

  function wheel(event: WheelEvent) {
    if (!canEdit || !geometry.current || pointers.size || event.ctrlKey || !event.deltaY) return;
    const anchor = localPoint(event);
    try {
      if (emit(zoomFrame(geometry.current, event.deltaY < 0 ? 1.1 : 0.9, anchor.x, anchor.y))) event.preventDefault();
    } catch (error) { inputError = error instanceof Error ? error.message : 'Framing change is not representable'; }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (This localized 2D application handles arrow keys; native framing controls remain outside it.) -->
<div
  bind:this={viewport}
  class="viewport"
  class:editable={canEdit}
  class:show-overflow={canEdit && !!gestureOutput}
  role={editable ? 'application' : 'img'}
  aria-roledescription={editable ? 'image framing' : undefined}
  aria-label={`${alt}: ${editable ? 'image framing; arrow keys move, plus and minus zoom' : 'framed image'}`}
  aria-disabled={editable && !canEdit ? true : undefined}
  tabindex={editable ? 0 : undefined}
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={pointerEnd}
  onpointercancel={pointerEnd}
  onlostpointercapture={pointerEnd}
  onkeydown={keyboard}
>
  {#if canEdit && gestureOutput && geometry.bounds && dimensions}
    <img class="overflow-preview" {src} alt="" aria-hidden="true" draggable="false"
      style:width={`${dimensions.width}px`} style:height={`${dimensions.height}px`}
      style:transform={`translate(${geometry.bounds.x}px, ${geometry.bounds.y}px) scale(${geometry.bounds.width / dimensions.width})`} />
  {/if}
  <div class="image-clip">
  {#if src}
    {#key src}
      <img
        bind:this={image}
        class:fade-in={fadeIn}
        {src}
        {alt}
        draggable="false"
        onload={loaded}
        onerror={failedImage}
        style:visibility={geometry.bounds ? 'visible' : 'hidden'}
        style:opacity={fadeIn && !geometry.bounds ? 0 : 1}
        style:width={`${dimensions?.width ?? 0}px`}
        style:height={`${dimensions?.height ?? 0}px`}
        style:transform={geometry.bounds && dimensions
          ? `translate(${geometry.bounds.x}px, ${geometry.bounds.y}px) scale(${geometry.bounds.width / dimensions.width})`
          : 'none'}
      />
    {/key}
  {/if}
  </div>
</div>
{#if problem}<p role="alert">{problem}</p>{/if}
{#if onopen}<button type="button" disabled={!dimensions} onclick={() => onopen?.()}>Open whole image</button>{/if}

<style>
  .viewport { position: relative; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border-radius: inherit; background: var(--bg, white); }
  .viewport.show-overflow { overflow: visible; z-index: 1; outline: 2px solid var(--muted, currentColor); }
  .image-clip { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; pointer-events: none; z-index: 1; }
  .overflow-preview { opacity: .35; }
  .viewport.editable { touch-action: none; cursor: grab; }
  @media (prefers-reduced-motion: no-preference) {
    img.fade-in { transition: opacity 180ms ease-out; }
  }
  img { position: absolute; top: 0; left: 0; max-width: none; max-height: none; transform-origin: top left; pointer-events: none; user-select: none; transition: none; }
</style>
