<script lang="ts">
  import { marked } from 'marked';

  let { source }: { source: string } = $props();
  let element = $state<HTMLDivElement>();
  const elements = ['p', 'br', 'strong', 'em', 'del', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];
  const attributes = ['href', 'title', 'start', 'colspan', 'rowspan', 'align'];

  $effect(() => {
    const target = element;
    const text = source;
    if (!target) return;
    const html = marked.parse(text, { async: false });
    if ('setHTML' in target) {
      (target as HTMLDivElement & { setHTML: (html: string, options: object) => void })
        .setHTML(html, { sanitizer: { elements, attributes } });
      return;
    }
    let active = true;
    target.textContent = text;
    void import('dompurify').then(({ default: DOMPurify }) => {
      if (!active) return;
      target.innerHTML = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [...elements, '#text'],
        ALLOWED_ATTR: attributes,
        ALLOW_ARIA_ATTR: false,
        ALLOW_DATA_ATTR: false,
        KEEP_CONTENT: false,
      });
    }).catch(() => { if (active) target.textContent = text; });
    return () => { active = false; };
  });
</script>

<div bind:this={element} class="ui-description ui-markdown"></div>
