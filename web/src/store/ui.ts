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
};

export const useUi = create<Ui>(() => ({
  editingItemId: null,
  settingsOpen: false,
  settingsTab: 'account',
  movingItemIds: null,
  mobileNavOpen: false,
  focusTitleFolderId: null,
}));

export const editItem = (id: string | null) => useUi.setState({ editingItemId: id });
export const openSettings = (tab: Ui['settingsTab'] = 'account') =>
  useUi.setState({ settingsOpen: true, settingsTab: tab });
export const closeSettings = () => useUi.setState({ settingsOpen: false });
export const askMoveItems = (ids: string[] | null) => useUi.setState({ movingItemIds: ids });
export const setMobileNav = (open: boolean) => useUi.setState({ mobileNavOpen: open });
export const focusFolderTitle = (id: string | null) => useUi.setState({ focusTitleFolderId: id });

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
