import { navigateTo } from '@/lib/navigation';

// Presenter mode for a folder (or the Inbox), optionally starting at one item. Asks for full screen
// while the click that started it still counts as a user gesture; browsers refuse it afterwards.
export function startPresenting(spaceId: string, folderId: string | null, itemId?: string) {
  void document.documentElement.requestFullscreen?.().catch(() => {});
  navigateTo(`/s/${spaceId}/present/${folderId ?? 'inbox'}${itemId ? `?i=${itemId}` : ''}`);
}
