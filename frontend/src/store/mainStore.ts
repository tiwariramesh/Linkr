import { makeAutoObservable } from 'mobx';
import { toast } from 'sonner';
import { API_ENDPOINTS } from './api';
import {
  ItemType,
  LoginType,
  RegisterType,
  TagFilterType,
  TagsObjectType,
  TagType,
  DeleteAccountType,
  UpdatePasswordType,
  UpdateUsernameType,
  UserType,
} from '@/lib/types.ts';
import { preferencesStore } from './preferencesStore.ts';
import { clientId, SyncConnection, SyncEntity } from './sync.ts';

class MainStore {
  prefStore: typeof preferencesStore;
  items: ItemType[] = [];
  tags: TagsObjectType = {};
  user: UserType | null = null;
  isAuthRequired: boolean | null = null;
  isSettingsModalOpen: boolean = false;
  preSelectedItemSettingsModal: string | null = null;
  tagFilter: TagFilterType = null; // Default to null for no tag selected. 'none' for without any tags
  isItemModalOpen: boolean = false;
  modalOpenItemID: number | null = null;
  appInfo: {
    installed_version: string | null;
    latest_version: string | null;
    update_available: boolean | null;
    registration_open: boolean;
  } | null = null;
  keepBulkActionsToolbar = false;
  sync: SyncConnection;

  constructor(prefStore) {
    this.prefStore = prefStore;
    this.sync = new SyncConnection(this.onRemoteChange);
    makeAutoObservable(this, { sync: false }); // Makes state observable and actions transactional
    this.getAppInfo();
  }

  // Another device (or tab) changed data: pull the fresh copy.
  onRemoteChange = (entities: SyncEntity[]) => {
    if (entities.includes('tags')) this.fetchTags();
    if (entities.includes('items')) this.fetchItems();
  };

  runRequest = (
    endpoint: string,
    method: string,
    bodyData: object | FormData,
    defaultErrorMessage: string,
    skipSuccessMessage: boolean = false,
    skipErrorMessage: boolean = false
  ) => {
    const options = {
      method: method,
      headers: {
        Accept: 'application/json',
        'X-Linkr-Client': clientId,
      },
    };

    if (!(bodyData instanceof FormData)) {
      options['headers']['Content-Type'] = 'application/json';
    }
    if (method !== 'GET' && method !== 'HEAD') {
      options['body'] = bodyData instanceof FormData ? bodyData : JSON.stringify(bodyData);
    }

    return fetch(endpoint, options)
      .then((response) => {
        if (response.ok) {
          return response.json();
        }

        if (response.status === 401) {
          this.setIsAuthRequired(true);
        }

        return response.json().then((data) => {
          throw new Error(data.message || `HTTP error! status: ${response.status}`);
        });
      })
      .then((data) => {
        if (typeof data.message !== 'undefined' && !skipSuccessMessage) {
          toast.success(data.message, { position: 'top-center' });
        }
        return data;
      })
      .catch((reason) => {
        if (!skipErrorMessage) {
          toast.error(reason instanceof Error ? reason.message : defaultErrorMessage, {
            position: 'top-center',
          });
        }

        return null;
      });
  };
  setTagFilter = (val: TagFilterType) => {
    this.tagFilter = val;
  };

  get itemListFilters() {
    const tagFilter = this.tagFilter;
    const responseOutput = (val: any) => ({
      tags: val,
    });

    if (tagFilter === null || tagFilter === 'none') {
      return responseOutput(tagFilter);
    }

    if (!this.prefStore.includeNestedTagItems) {
      return responseOutput([tagFilter]);
    }

    const selectedTag = this.tags[tagFilter] ?? null;
    // Tag doesn't exist. This can happen when user manually changes URL to a non existing tag ID or when the selected tag has been deleted since the last load.
    if (!selectedTag) {
      return responseOutput([tagFilter]);
    }

    const childTagIDs = this.tagsArray
      .filter((tag) => tag.fullPathIDs.startsWith(`${selectedTag.fullPathIDs}/`) && tag.id !== selectedTag.id)
      .map((tag) => tag.id);

    return responseOutput([selectedTag.id, ...childTagIDs]);
  }

  setUser = (user: UserType) => {
    this.user = user;
    this.isAuthRequired = false;
    this.sync.start();
  };

  // Forget everything belonging to the previous account.
  unsetUser = () => {
    this.sync.stop();
    this.user = null;
    this.items = [];
    this.tags = {};
    this.tagFilter = null;
    this.isSettingsModalOpen = false;
    this.isAuthRequired = true;
  };
  setTags = (tags: TagsObjectType) => {
    const renderTagSegment = (tag: TagType) => {
      let fullPath = '';
      let fullPathIDs = '';
      if (tag.parent !== 0) {
        const parentTag = tags[tag.parent];
        if (parentTag) {
          const paths = renderTagSegment(parentTag);
          fullPath += paths.fullPath + '/';
          fullPathIDs += paths.fullPathIDs + '/';
        }
      }
      fullPath += tag.title.replaceAll('/', '\\/');
      fullPathIDs += String(tag.id);
      return { fullPath, fullPathIDs };
    };

    for (const tagID in tags) {
      const tag = tags[tagID];
      const { fullPath, fullPathIDs } = renderTagSegment(tag);
      tag.fullPath = fullPath;
      tag.fullPathIDs = fullPathIDs;
      tag.pinned = !!tag.pinned;
    }

    this.tags = tags as TagsObjectType;
  };
  get tagsArray() {
    const tagsArray = Object.values(this.tags) as TagType[];

    tagsArray.sort((a, b) => {
      return a.fullPath.localeCompare(b.fullPath);
    });

    return tagsArray;
  }
  setIsAuthRequired = (val: boolean) => {
    this.isAuthRequired = val;
    if (val) this.sync.stop();
  };
  fetchTags = async () => {
    return this.runRequest(API_ENDPOINTS.tags.list, 'GET', {}, 'Error fetching tags').then((data) => {
      if (data === null) {
        return;
      }
      this.setTags(data);
    });
  };
  createTag = async (title: string): Promise<number | null> => {
    const response = await this.runRequest(API_ENDPOINTS.tags.create, 'POST', { title }, 'Error creating tag');

    if (response === null || !response?.data?.tag_id) {
      return null;
    }

    await this.fetchTags();

    return response.data.tag_id;
  };
  onDeleteTag = async (tagID: number) => {
    return this.runRequest(API_ENDPOINTS.tags.deleteTag(tagID), 'DELETE', {}, 'Error deleting tag').finally(() => {
      this.fetchTags();
      this.fetchItems();
    });
  };
  updateTag = async (tagID: number, parent: number, title: string, description: string) => {
    const response = await this.runRequest(
      API_ENDPOINTS.tags.update(tagID),
      'PATCH',
      { parent, title, description },
      'Error updating tag'
    );

    if (response === null) {
      return false;
    }

    this.fetchTags();
    return true;
  };
  onChangeTagColor = async (tagID: number, color: string) => {
    return this.runRequest(
      API_ENDPOINTS.tags.updateColor(tagID),
      'PATCH',
      { color },
      'Error updating tag color'
    ).finally(() => {
      const tag = { ...this.tags[tagID], color };
      this.tags = { ...this.tags, [tagID]: tag };
    });
  };
  updateTagPinned = async (tagID: number, pinned: boolean) => {
    const response = await this.runRequest(
      API_ENDPOINTS.tags.updatePinned(tagID),
      'PATCH',
      { pinned },
      'Error updating tag pinned'
    );
    if (response === null) {
      return false;
    }

    const tag = { ...this.tags[tagID], pinned };
    this.tags = { ...this.tags, [tagID]: tag };
    return true;
  };

  setItems = (val: ItemType[]) => {
    this.items = val;
  };
  openItemEditModal = (itemID: number) => {
    this.isItemModalOpen = true;
    this.modalOpenItemID = itemID;
  };
  openItemCreateModal = () => {
    this.isItemModalOpen = true;
    this.modalOpenItemID = null;
  };
  closeModal = () => {
    this.isItemModalOpen = false;
    this.modalOpenItemID = null;
  };
  setIsItemModalOpen = (val: boolean) => {
    this.isItemModalOpen = val;
  };
  setIsSettingsModalOpen = (val: boolean) => {
    this.isSettingsModalOpen = val;
  };
  setPreSelectedItemSettingsModal = (val: string) => {
    this.preSelectedItemSettingsModal = val;
  };
  fetchItems = async () => {
    return await this.runRequest(API_ENDPOINTS.items.list, 'GET', {}, 'Failed to fetch items').then((data) => {
      if (data === null) {
        return;
      }
      this.setItems(data);
    });
  };
  deleteItems = async (itemIds: number[]) => {
    return await this.runRequest(
      API_ENDPOINTS.items.deleteItems,
      'POST',
      {
        'item-ids': itemIds,
      },
      'Failed to delete item'
    );
  };
  refetchItemsMetadata = async (itemIds: number[]) => {
    return await this.runRequest(
      API_ENDPOINTS.items.refetchItemsMetadata,
      'POST',
      {
        'item-ids': itemIds,
      },
      'Failed to fetch metadata'
    );
  };
  updateItemsTags = async ({
    itemIds,
    newSelectedTagsAll,
    newSelectedTagsSome,
  }: {
    itemIds: number[];
    newSelectedTagsAll: string[];
    newSelectedTagsSome: string[];
  }) => {
    return await this.runRequest(
      API_ENDPOINTS.items.updateItemsTags,
      'PATCH',
      {
        'item-ids': itemIds,
        'tag-ids-all': newSelectedTagsAll.map((id) => parseInt(id, 10)),
        'tag-ids-some': newSelectedTagsSome.map((id) => parseInt(id, 10)),
      },
      'Failed to update items tags'
    );
  };
  createItem = async (data: ItemType, skipSuccessMessage: boolean = false) => {
    data.url = encodeURI(decodeURI(data.url));
    data.image = encodeURI(decodeURI(data.image));

    const response = await this.runRequest(
      API_ENDPOINTS.items.createItem,
      'POST',
      data,
      'Failed to create item',
      skipSuccessMessage
    );

    if (!response) {
      return false;
    }

    this.fetchTags();
    this.fetchItems();
    return true;
  };
  updateItem = async (data: ItemType, itemId, forceImageRefetch: boolean) => {
    data.url = encodeURI(decodeURI(data.url));
    data.image = encodeURI(decodeURI(data.image));

    const response = await this.runRequest(
      API_ENDPOINTS.items.updateItem(itemId),
      'PATCH',
      {
        ...data,
        ...{ 'force-image-refetch': forceImageRefetch },
      } as ItemType & { 'force-image-refetch': boolean },
      'Failed to update item'
    );
    if (!response) {
      return false;
    }

    this.fetchTags();
    this.fetchItems();
    return true;
  };
  getUser = async (noErrorEmit: boolean = false) => {
    const response = await this.runRequest(
      API_ENDPOINTS.settings.getUser,
      'GET',
      {},
      'Failed to fetch user',
      true,
      noErrorEmit
    );
    if (response === null || !response?.data?.user) {
      return false;
    }

    this.setUser(response.data.user);
    return true;
  };

  register = async (values: RegisterType) => {
    const response = await this.runRequest(API_ENDPOINTS.auth.register, 'POST', values, 'Failed to create account');

    if (response === null || !response?.data?.user) {
      return false;
    }

    this.setUser(response.data.user);
    return true;
  };

  updateUsername = async (values: UpdateUsernameType) => {
    const response = await this.runRequest(
      API_ENDPOINTS.settings.userName,
      'PATCH',
      values,
      'Failed to update username'
    );

    if (response === null) {
      return false;
    }

    this.setUser({ ...this.user, ...{ username: values.username } });
    return true;
  };

  updatePassword = async (values: UpdatePasswordType) => {
    const response = await this.runRequest(
      API_ENDPOINTS.settings.password,
      'PATCH',
      values,
      'Failed to update password'
    );
    if (response === null) {
      return false;
    }
    return true;
  };

  deleteAccount = async (values: DeleteAccountType) => {
    const response = await this.runRequest(API_ENDPOINTS.settings.delete, 'DELETE', values, 'Failed to delete account');
    if (response === null) {
      return false;
    }
    this.unsetUser();
    return true;
  };
  logOut = () => {
    return this.runRequest(API_ENDPOINTS.auth.logout, 'POST', {}, 'Failed to log out').then((response) => {
      if (response === null) {
        return;
      }
      this.unsetUser();
    });
  };

  login = async (values: LoginType) => {
    const response = await this.runRequest(API_ENDPOINTS.auth.login, 'POST', values, 'Failed to log in');

    if (response === null || !response?.data?.user) {
      return;
    }

    this.setUser(response.data.user);
  };
  importPocketBookmarks = async (selectedFile: File) => {
    return await this.importBookmarks(selectedFile, 'pocket-zip', API_ENDPOINTS.importBookmarks.pocket);
  };

  importBrowserBookmarks = async (selectedFile: File) => {
    return await this.importBookmarks(
      selectedFile,
      'bookmark-file-html',
      API_ENDPOINTS.importBookmarks.browser,
      'browser'
    );
  };

  importRaindropIoBookmarks = async (selectedFile: File) => {
    return await this.importBookmarks(
      selectedFile,
      'bookmark-file-html',
      API_ENDPOINTS.importBookmarks.browser,
      'Raindrop.io'
    );
  };

  importBookmarks = async (selectedFile: File, inputName: string, endpointUrl: string, importSourceName?: string) => {
    const formData = new FormData();
    formData.append(inputName, selectedFile);
    if (importSourceName) {
      formData.append('import-source-name', importSourceName);
    }

    return await this.runRequest(endpointUrl, 'POST', formData, 'Failed to import bookmarks').then((response) => {
      if (response === null) {
        return false;
      }
      this.setIsSettingsModalOpen(false);
      this.fetchItems();
      this.fetchTags();
      return true;
    });
  };

  fetchUrlMetadata = async (url: string) => {
    return this.runRequest(
      '/api/url/fetch-metadata',
      'POST',
      { url: encodeURI(decodeURI(url)) },
      'Error fetching metadata from URL'
    );
  };

  getAppInfo = async () => {
    const response = await this.runRequest(API_ENDPOINTS.appInfo, 'GET', {}, 'Error fetching app info', true, true);

    if (response === null || !response.data) {
      return;
    }

    this.appInfo = response.data;
    return response.data;
  };

  setKeepBulkActionsToolbar = (val: boolean) => {
    this.keepBulkActionsToolbar = val;
  };
}

export const mainStore = new MainStore(preferencesStore);
