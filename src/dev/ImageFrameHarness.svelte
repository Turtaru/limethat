<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import ImageFrameEditor from '../lib/images/ImageFrameEditor.svelte';
  import ImageFrameViewport from '../lib/images/ImageFrameViewport.svelte';
  import { containedFrame } from '../lib/images/image-frame';
  import type { ImageFrame } from '../lib/images/image-frame';
  import { processPicture } from '../lib/pictures';

  let picture = $state.raw<{ url: string; name: string } | null>(null);
  let original = $state.raw<ImageFrame | null>(null);
  let draft = $state.raw<ImageFrame | null>(null);
  let secondDraft = $state.raw<ImageFrame | null>(null);
  let secondEditor = $state(false);
  let viewportWidth = $state(480);
  let status = $state('Choose a local picture. No folder permission or archive writes are involved.');
  let dialog: HTMLDialogElement;
  let generation = 0;
  const dirty = $derived(JSON.stringify(original) !== JSON.stringify(draft));

  onDestroy(() => {
    generation++;
    if (picture) URL.revokeObjectURL(picture.url);
  });

  async function choose(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const current = ++generation;
    try {
      const processed = await processPicture(file, stage => {
        if (current === generation) status = stage;
      });
      if (current !== generation) return;
      const previous = picture;
      dialog?.close();
      original = containedFrame(400);
      draft = { ...original };
      secondDraft = { ...original };
      picture = { url: URL.createObjectURL(processed.image), name: file.name };
      status = 'Processed locally. New replacements start contained at the top left. Draft changes remain in memory.';
      await tick();
      if (previous) URL.revokeObjectURL(previous.url);
    } catch (error) {
      if (current === generation) status = error instanceof Error ? error.message : 'Image processing failed. Choose another picture.';
    }
  }

  function legacy() {
    original = null;
    draft = null;
  }
</script>

<section aria-label="Development-only image framing harness">
  <h2>Image framing spike</h2>
  <label>Local image <input type="file" accept="image/*" onchange={choose} /></label>
  <p role="status">{status}</p>
  {#if picture}
    <label>Viewport width
      <input type="range" min="160" max="900" step="1" bind:value={viewportWidth} />
      {viewportWidth}px (limited by the available page width)
    </label>
    <p>
      <button type="button" onclick={legacy}>Load as legacy / missing frame</button>
      <button type="button" onclick={() => { draft = original ? { ...original } : null; }}>Cancel draft changes</button>
    </p>
    <div style:max-width={`${viewportWidth}px`}>
      <ImageFrameEditor src={picture.url} alt={picture.name} frame={draft} onchange={value => { draft = value; }} onopen={() => dialog.showModal()} />
    </div>
    <p>Draft: {dirty ? 'changed' : 'unchanged'}; stored frame: {draft ? 'present' : 'missing (derived cover only)'}.</p>
    <pre>{JSON.stringify(draft, null, 2)}</pre>
    <h3>Read-only preview (same draft, narrower viewport)</h3>
    <div style:max-width="240px">
      <ImageFrameViewport src={picture.url} alt={picture.name} frame={draft} onopen={() => dialog.showModal()} />
    </div>
    <label><input type="checkbox" bind:checked={secondEditor} /> Mount a second independent editor</label>
    {#if secondEditor}
      <div style:max-width="320px">
        <ImageFrameEditor src={picture.url} alt={`Independent copy of ${picture.name}`} frame={secondDraft} onchange={value => { secondDraft = value; }} />
      </div>
      <pre>{JSON.stringify(secondDraft, null, 2)}</pre>
    {/if}
  {/if}
  <dialog bind:this={dialog}>
    {#if picture}<img src={picture.url} alt={`Whole image: ${picture.name}`} style:max-width="80vw" style:max-height="75vh" />{/if}
    <form method="dialog"><button>Close whole image</button></form>
  </dialog>
</section>
