<script lang="ts">
  import { AppShell, Button } from '../lib/ui-kit';
  import { useSession } from './session.svelte';
  import { installation, pwa, applyUpdate } from './pwa.svelte';
  import Connection from './Connection.svelte';

  const session = useSession();
  const install = installation.state;
</script>

<AppShell>
  {#snippet header()}
    <div class="ui-cluster ui-welcome-brand">
      <img src={`${import.meta.env.BASE_URL}icons/logo.svg`} alt="" width="36" height="36">
      <strong>limethat</strong>
      <span class="ui-muted">A home for your moments</span>
    </div>
  {/snippet}

  <div class="ui-welcome">
    <div class="ui-heading ui-welcome-intro">
      <p class="ui-heading__eyebrow">Your life. Your files.</p>
      <h1 class="ui-heading__title">Keep the moments.<br><span>Keep them yours.</span></h1>
      <p class="ui-heading__subtitle">A little journal for the things you want to remember. Notes, pictures, and everyday moments — saved in a folder you own.</p>
    </div>

    {#if !install.standalone && !install.installed}
      <section class="ui-welcome-install ui-cluster" aria-labelledby="install-title">
        <span class="ui-welcome-install-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v11m-4-4 4 4 4-4M5 15v5h14v-5" /></svg></span>
        <div>
          <p class="ui-heading__eyebrow">{install.available || install.busy ? 'Your journal, one tap away' : 'At home in your browser'}</p>
          <h2 id="install-title">{install.available || install.busy ? 'Make yourself at home.' : 'No installation needed.'}</h2>
          <p class="ui-muted">{install.available || install.busy ? 'Get an app window and a home-screen shortcut. Installation is optional — your journal works here, too.' : 'You can use Limethat right here. If your browser offers installation, you can add it from the browser menu whenever you like.'}</p>
          {#if install.available || install.busy}
            <Button variant="primary" aria-disabled={install.busy} onclick={() => installation.install()}>{install.busy ? 'Installing…' : 'Install Limethat'} <span aria-hidden="true">↓</span></Button>
          {/if}
        </div>
      </section>
    {/if}
    {#if install.message}<p class="ui-status" role="status">{install.message}</p>{/if}
    {#if install.error}<p class="ui-error" role="alert">{install.error}</p>{/if}

    <section class="ui-welcome-archive" aria-labelledby="archive-title">
      <div class="ui-welcome-folder" aria-hidden="true">
        <div class="ui-welcome-folder-tab"></div>
        <div class="ui-welcome-folder-front">
          <span class="ui-welcome-folder-name">my moments</span>
          <div class="ui-welcome-file"><span class="ui-welcome-file-type">MD</span><span>A day worth keeping<span class="ui-welcome-file-meta">moments / 2026-11-24.md</span></span><span class="ui-welcome-file-dot"></span></div>
          <div class="ui-welcome-file"><span class="ui-welcome-file-type ui-muted">JPG</span><span>The pictures, too<span class="ui-welcome-file-meta">attachments /</span></span><span class="ui-welcome-file-dot"></span></div>
          <span class="ui-welcome-folder-caption">Ordinary files. Not locked away.</span>
        </div>
      </div>
      <div class="ui-welcome-copy">
        <p class="ui-heading__eyebrow">Start with a folder</p>
        <h2 id="archive-title">{session.workspace.capability.supported ? 'Make room for your memories.' : 'Your folder needs a supported browser.'}</h2>
        <p class="ui-muted">{session.workspace.capability.supported ? 'Choose an existing Limethat archive, or start fresh in an empty folder. Everything you add stays there.' : 'Limethat needs direct folder access to read and write your journal. Your files are never uploaded as a workaround.'}</p>
        <Connection compact welcome />
        <p class="ui-muted ui-welcome-permission">{session.workspace.capability.supported ? 'You choose the folder. Your browser asks for permission.' : 'Installing the app does not add folder access support.'}</p>
      </div>
    </section>

    <p class="ui-welcome-trust ui-muted">No account. No uploads. Markdown notes and ordinary pictures.</p>
    {#if pwa.update}<Button disabled={session.draftCount > 0 || !!session.workspace.operation || pwa.activating} onclick={applyUpdate}>{pwa.activating ? 'Updating…' : 'Update and reload'}</Button>{/if}
    {#if pwa.error}<p class="ui-error" role="alert">{pwa.error}</p>{/if}
  </div>

  {#snippet footer()}
    <p class="ui-muted ui-welcome-footer">Your folder is the archive. Limethat is the window into it.</p>
  {/snippet}
</AppShell>
