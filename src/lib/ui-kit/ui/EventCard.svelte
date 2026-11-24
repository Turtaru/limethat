<script lang="ts">
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Props = {
    href: string;
    title: string;
    date?: string;
    image?: string;
    picture?: Snippet;
    dateLabel?: string;
    description?: string;
    labels?: string[];
    locale?: string;
    onclick?: HTMLAnchorAttributes['onclick'];
  };

  let { href, title, date, image, picture, dateLabel, description, labels = [], locale = 'en', onclick }: Props = $props();
  const parsed = $derived(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00`) : null);
  const day = $derived(parsed && !Number.isNaN(parsed.getTime()) ? parsed : null);
  const fullDate = $derived(day ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(day) : 'Date unknown');
</script>

<article class="ui-event-card">
  <a class="ui-event-card__link" {href} {onclick} aria-label={`${title}, ${dateLabel ?? fullDate}`}>
    {#if picture || image}
      <div class="ui-event-card__media">
        {#if picture}{@render picture()}{:else if image}<img class="ui-event-card__image" src={image} alt="" loading="lazy">{/if}
      </div>
    {/if}
    <div class="ui-event-card__caption">
      {#if day}
        <time class="ui-event-card__date" datetime={date}>
          <strong class="ui-event-card__day">{String(day.getDate()).padStart(2, '0')}</strong>
          <span class="ui-event-card__month">{new Intl.DateTimeFormat(locale, { month: 'short' }).format(day)}<br>{day.getFullYear()}</span>
        </time>
      {:else}
        <span class="ui-event-card__date ui-event-card__undated">{dateLabel ?? date ?? 'No date'}</span>
      {/if}
      <div class="ui-event-card__content">
        {#if labels.length}<p class="ui-event-card__labels">{labels.join(' · ')}</p>{/if}
        <h2 class="ui-event-card__title">{title}</h2>
      </div>
    </div>
    {#if description?.trim()}
      <div class="ui-event-card__description"><p>{description}</p></div>
    {/if}
  </a>
</article>
