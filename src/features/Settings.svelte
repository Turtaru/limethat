<script lang="ts">
  import { Button, Field, PageHeading } from '../lib/ui-kit';
  import { useSession } from './session.svelte';
  import { pwa, applyUpdate } from './pwa.svelte';
  import Connection from './Connection.svelte';
  const session = useSession();
  function themeChanged() {
    try { localStorage.setItem('limethat-theme', session.theme); }
    catch { session.notice = 'Theme changed, but this browser could not remember the preference.'; }
  }
</script>
<div class="ui-stack">
  <PageHeading title="Settings" subtitle="Your archive and preferences." />
  <section class="ui-section ui-stack"><h2>Archive connection</h2><Connection /></section>
  <section class="ui-section"><Field label="Color theme">{#snippet children(control)}<select class="ui-input" id={control.id} bind:value={session.theme} onchange={themeChanged}><option value="dark">Dark</option><option value="light">Light</option></select>{/snippet}</Field></section>
  {#if pwa.update}<Button disabled={session.draftCount > 0 || !!session.workspace.operation || pwa.activating} onclick={applyUpdate}>{pwa.activating ? 'Updating…' : 'Update and reload'}</Button>{/if}
  {#if pwa.error}<p class="ui-error" role="alert">{pwa.error}</p>{/if}
</div>
