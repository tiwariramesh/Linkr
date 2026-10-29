import type { FolderView } from '@/lib/types';

// The Inbox has no folder row to store its view settings in, so they live in this browser.
const INBOX_VIEW_KEY = 'linkr-inbox-view';

export function readInboxView(): FolderView {
  try {
    return JSON.parse(localStorage.getItem(INBOX_VIEW_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveInboxView(view: FolderView) {
  try {
    localStorage.setItem(INBOX_VIEW_KEY, JSON.stringify(view));
  } catch {
    // storage blocked
  }
}
