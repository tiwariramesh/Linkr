import { create } from 'zustand';

// Which dialogs are open. Kept apart from the data store so opening a dialog never re-renders lists.
type Ui = {
  editingItemId: string | null;
  settingsOpen: boolean;
  settingsTab: 'account' | 'import' | 'appearance' | 'about';
  movingItemIds: string[] | null;
  mobileNavOpen: boolean;
  // A just-created folder whose title should be focused for typing.
  focusTitleFolderId: string | null;
  paletteOpen: boolean;
  // The session notes panel beside a folder's items (remembered per browser).
  sessionNotesOpen: boolean;
  // The folder being copied with "Run again" (its dialog is open).
  runAgainFolderId: string | null;
  // A highlight to scroll to and flash in the reader view (set from a highlights list).
  focusHighlightId: string | null;
  // Highlights of the open reader copy whose text couldn't be found in it.
  lostHighlightIds: string[];
};

const SESSION_NOTES_KEY = 'linkr-session-notes';
function readSessionNotesOpen() {
  try {
    return localStorage.getItem(SESSION_NOTES_KEY) === 'open';
  } catch {
    return false;
  }
}

export const useUi = create<Ui>(() => ({
  editingItemId: null,
  settingsOpen: false,
  settingsTab: 'account',
  movingItemIds: null,
  mobileNavOpen: false,
  focusTitleFolderId: null,
  paletteOpen: false,
  sessionNotesOpen: readSessionNotesOpen(),
  runAgainFolderId: null,
  focusHighlightId: null,
  lostHighlightIds: [],
}));

export const editItem = (id: string | null) => useUi.setState({ editingItemId: id });
export const openSettings = (tab: Ui['settingsTab'] = 'account') =>
  useUi.setState({ settingsOpen: true, settingsTab: tab });
export const closeSettings = () => useUi.setState({ settingsOpen: false });
export const askMoveItems = (ids: string[] | null) => useUi.setState({ movingItemIds: ids });
export const setMobileNav = (open: boolean) => useUi.setState({ mobileNavOpen: open });
export const focusFolderTitle = (id: string | null) => useUi.setState({ focusTitleFolderId: id });
export const askRunAgain = (folderId: string | null) => useUi.setState({ runAgainFolderId: folderId });
export const focusHighlight = (id: string | null) => useUi.setState({ focusHighlightId: id });
export const openPalette = (open: boolean) => useUi.setState({ paletteOpen: open });
export function showSessionNotes(open: boolean) {
  useUi.setState({ sessionNotesOpen: open });
  try {
    localStorage.setItem(SESSION_NOTES_KEY, open ? 'open' : 'closed');
  } catch {
    // storage blocked
  }
}

// Which folders are expanded in the sidebar, remembered per browser.
const EXPANDED_KEY = 'linkr-expanded';
function readExpanded(): string[] {
  try {
    return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]');
  } catch {
    return [];
  }
}
export const useExpanded = create<{ ids: string[] }>(() => ({ ids: readExpanded() }));
export function setExpanded(id: string, open: boolean) {
  const ids = useExpanded.getState().ids.filter((x) => x !== id);
  if (open) ids.push(id);
  useExpanded.setState({ ids });
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(ids));
  } catch {
    // storage blocked
  }
}
