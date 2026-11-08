import type { Workspace } from '../lib/workspace.svelte';

declare global {
  interface Window { limethat?: Workspace }
}
