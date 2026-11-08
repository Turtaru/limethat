<main>
  <h1>Limethat</h1>
  <p>Folder archive foundation. Application views are not installed yet.</p>
  {#if import.meta.env.DEV}
    {#await import('./dev/WorkspaceHarness.svelte') then { default: Harness }}
      <Harness />
    {/await}
  {/if}
</main>
