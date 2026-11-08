<main>
  {#if import.meta.env.MODE === 'framing'}
    <h1>Limethat image framing harness</h1>
  {:else}
    <h1>Limethat</h1>
    <p>Folder archive foundation. Application views are not installed yet.</p>
    {#if import.meta.env.DEV}
      {#await import('./dev/WorkspaceHarness.svelte') then { default: Harness }}
        <Harness />
      {/await}
    {/if}
  {/if}
  {#if import.meta.env.DEV || import.meta.env.MODE === 'framing'}
    {#await import('./dev/ImageFrameHarness.svelte') then { default: ImageHarness }}
      <ImageHarness />
    {/await}
  {/if}
</main>
