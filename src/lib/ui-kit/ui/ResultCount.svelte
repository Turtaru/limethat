<script lang="ts">
  let { count, singular, plural = `${singular}s` }: { count: number; singular: string; plural?: string } = $props();
</script>

<p class="ui-summary" role="status">{count} {count === 1 ? singular : plural}</p>
