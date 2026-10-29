import { type AnySQLiteColumn, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ---- Accounts (shape required by Better Auth with the username plugin) ----

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  username: text('username').unique(),
  displayUsername: text('displayUsername'),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_userId_idx').on(t.userId)]
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('account_userId_idx').on(t.userId)]
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)]
);

// ---- Linkr data. Everything belongs to a space; members of the space can see it. ----
// IDs are short random strings so clients can create rows before the server confirms them.
// Timestamps are ISO 8601 UTC strings. `position` holds fractional-index keys for manual ordering.

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  color: text('color').notNull().default('orange'),
  kind: text('kind', { enum: ['personal', 'team'] })
    .notNull()
    .default('personal'),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const spaceMembers = sqliteTable(
  'space_members',
  {
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] }), index('space_members_user_idx').on(t.userId)]
);

export const folders = sqliteTable(
  'folders',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnySQLiteColumn => folders.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    icon: text('icon'),
    color: text('color'),
    position: text('position').notNull(),
    // A folder can be a session: a dated class, meeting or topic run.
    sessionDate: text('session_date'),
    term: text('term'),
    // Display preferences: { layout: 'cards' | 'list', sort: 'manual' | 'newest' | 'oldest' | 'title' }
    view: text('view', { mode: 'json' }).$type<{ layout?: string; sort?: string }>(),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    archivedAt: text('archived_at'),
    deletedAt: text('deleted_at'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('folders_space_idx').on(t.spaceId), index('folders_parent_idx').on(t.parentId)]
);

export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    // null = the space's Inbox
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['link', 'note', 'file', 'image', 'video', 'pdf'] })
      .notNull()
      .default('link'),
    title: text('title').notNull(),
    url: text('url').notNull().default(''),
    description: text('description').notNull().default(''),
    notes: text('notes').notNull().default(''),
    // Rich note document (editor JSON), used from the notes phase on.
    body: text('body'),
    image: text('image').notNull().default(''),
    favicon: text('favicon').notNull().default(''),
    siteName: text('site_name').notNull().default(''),
    color: text('color'),
    pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
    position: text('position').notNull(),
    // Link previews are fetched in the background after saving.
    fetchStatus: text('fetch_status', { enum: ['pending', 'done', 'failed'] })
      .notNull()
      .default('done'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    index('items_space_idx').on(t.spaceId),
    index('items_folder_idx').on(t.folderId),
    index('items_space_url_idx').on(t.spaceId, t.url),
  ]
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnySQLiteColumn => tags.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    color: text('color'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('tags_space_idx').on(t.spaceId)]
);

export const itemTags = sqliteTable(
  'item_tags',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.tagId] }), index('item_tags_tag_idx').on(t.tagId)]
);

// Append-only change log. Devices sync by asking for everything after the last `seq` they saw;
// later phases read it for activity history.
export const changes = sqliteTable(
  'changes',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    spaceId: text('space_id').notNull(),
    entity: text('entity', { enum: ['space', 'folder', 'item', 'tag'] }).notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op', { enum: ['upsert', 'delete'] }).notNull(),
    actorId: text('actor_id'),
    at: text('at').notNull(),
  },
  (t) => [index('changes_space_seq_idx').on(t.spaceId, t.seq)]
);
