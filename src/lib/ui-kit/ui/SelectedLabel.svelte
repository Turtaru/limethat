<script lang="ts">
  let { name, onremove }: { name: string; onremove: () => void } = $props();
</script>

<span class="ui-selected-label">
  <span>{name}</span>
  <button type="button" onclick={onremove} aria-label={`Remove label: ${name}`}>Remove</button>
</span>
