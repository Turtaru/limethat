import type { ListPosition } from './list-position';

export type EventListPosition = ListPosition;

export const eventListNavigation = $state<{ position: EventListPosition | null }>({ position: null });
export const labelListNavigation = $state<{ position: EventListPosition | null }>({ position: null });
