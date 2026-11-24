export const eventPhotoTransition = $state<{
  eventId: string | null;
  kind: 'event' | 'label';
  ready: (() => void) | null;
  file: File | null;
  name: string | null;
  returning: boolean;
}>({ eventId: null, kind: 'event', ready: null, file: null, name: null, returning: false });

export const loadedThumbnails = new WeakMap<Element, File>();
