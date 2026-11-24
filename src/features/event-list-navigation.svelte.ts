export type EventListPosition = { url: string; y: number; eventId?: string; offset?: number; focusHref?: string };

export const eventListNavigation = $state<{ position: EventListPosition | null }>({ position: null });
export const labelListNavigation = $state<{ position: EventListPosition | null }>({ position: null });
