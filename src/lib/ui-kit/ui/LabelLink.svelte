<script lang="ts">
  import type { HTMLAnchorAttributes } from 'svelte/elements';

  let { href, name, onclick }: { href: string; name: string; onclick?: HTMLAnchorAttributes['onclick'] } = $props();
</script>

<a class="ui-label-link" {href} {onclick}><span>{name}</span></a>
