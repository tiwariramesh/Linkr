import { toast } from 'sonner';
import { create } from 'zustand';
import { api, ApiError } from '@/lib/api';
import type { AppNotification, Item } from '@/lib/types';
import { refreshSpaces } from '@/store/store';

// Notifications and the actions they offer (accept an invitation, save something sent to you), plus
// sending items to other accounts. The server pushes "notifications" events; store.ts turns them into
// a "linkr:notifications" browser event, handled here.

export const useNotifications = create<{ list: AppNotification[]; loaded: boolean }>(() => ({
  list: [],
  loaded: false,
}));

export const unreadCount = (list: AppNotification[]) => list.filter((n) => !n.readAt).length;

export async function loadNotifications() {
  try {
    useNotifications.setState({ list: await api.get<AppNotification[]>('/notifications'), loaded: true });
  } catch {
    // signed out or offline
  }
}
window.addEventListener('linkr:notifications', () => void loadNotifications());

const failed = (error: unknown) => toast.error(error instanceof ApiError ? error.message : 'Something went wrong');

export async function markAllRead() {
  const now = new Date().toISOString();
  useNotifications.setState((state) => ({ list: state.list.map((n) => (n.readAt ? n : { ...n, readAt: now })) }));
  await api.post('/notifications/read', {}).catch(failed);
}

export async function dismissNotification(id: string) {
  useNotifications.setState((state) => ({ list: state.list.filter((n) => n.id !== id) }));
  await api.delete(`/notifications/${id}`).catch(failed);
}

// Returns the joined space's ID when accepted.
export async function answerInvite(inviteId: string, accept: boolean): Promise<string | null> {
  try {
    const { spaceId } = await api.post<{ spaceId: string | null }>(
      `/invites/${inviteId}/${accept ? 'accept' : 'decline'}`
    );
    await Promise.all([refreshSpaces(), loadNotifications()]);
    return spaceId;
  } catch (error) {
    failed(error);
    await loadNotifications();
    return null;
  }
}

// Saves a link or note someone sent into your Personal space's Inbox.
export async function saveSent(notificationId: string): Promise<Item | null> {
  try {
    const item = await api.post<Item>(`/notifications/${notificationId}/save`, {});
    await loadNotifications();
    return item;
  } catch (error) {
    failed(error);
    return null;
  }
}

export async function sendItem(itemId: string, to: string, message: string): Promise<boolean> {
  try {
    const { to: name } = await api.post<{ to: string }>(`/items/${itemId}/send`, { to, message });
    toast.success(`Sent to ${name}`);
    return true;
  } catch (error) {
    failed(error);
    return false;
  }
}
