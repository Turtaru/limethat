<script lang="ts">
  import Dock from '../lib/ui-kit/ui/Dock.svelte';
  import { Navigation } from '../lib/ui-kit';
  import { useSession } from './session.svelte';
  let { section, label, icon = 'create', disabled = false, type = 'button', form, onclick }: {
    section: 'events' | 'labels' | 'settings'; label: string;
    icon?: 'create' | 'edit' | 'save' | 'reset' | 'folder'; disabled?: boolean;
    type?: 'button' | 'submit'; form?: string; onclick?: (event: MouseEvent) => void;
  } = $props();
  const session = useSession();
  function navigate(event: MouseEvent) {
    if (!(event.target instanceof Element) || !event.target.closest('a')) return;
    if (session.workspace.operation) { event.preventDefault(); return; }
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    session.viewer = null;
  }
</script>
<Dock {label} {icon} {disabled} {type} {form} {onclick}>
  <Navigation onclick={navigate} items={[{ href: '#/events', label: 'Events', current: section === 'events' }, { href: '#/labels', label: 'Labels', current: section === 'labels' }, { href: '#/settings', label: 'Settings', current: section === 'settings' }]} />
</Dock>
