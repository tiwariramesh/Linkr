-- Phase 1: spaces and folders. Every user gets a Personal space; their existing links and tags move into it,
-- with links landing in the Inbox (no folder). Old integer IDs are kept as text so cached images still match.
-- Positions are left empty here and filled in by the server on start (see backfillPositions).

CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text DEFAULT 'orange' NOT NULL,
	`kind` text DEFAULT 'personal' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `space_members` (
	`space_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`space_id`, `user_id`),
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`icon` text,
	`color` text,
	`position` text NOT NULL,
	`session_date` text,
	`term` text,
	`view` text,
	`pinned` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`deleted_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `changes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`space_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`actor_id` text,
	`at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `spaces` (`id`, `name`, `icon`, `color`, `kind`, `created_by`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(8))), 'Personal', NULL, 'orange', 'personal', `id`,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `user`;
--> statement-breakpoint
INSERT INTO `space_members` (`space_id`, `user_id`, `role`, `created_at`)
SELECT `id`, `created_by`, 'owner', `created_at` FROM `spaces`;
--> statement-breakpoint
CREATE TABLE `tags_new` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `tags_new`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `tags_new` (`id`, `space_id`, `parent_id`, `title`, `color`, `created_at`, `updated_at`)
SELECT CAST(t.`id` AS TEXT), s.`id`,
       CASE WHEN t.`parent` = 0 THEN NULL ELSE CAST(t.`parent` AS TEXT) END,
       t.`title`, CASE WHEN t.`color` = 'gray' THEN NULL ELSE t.`color` END,
       t.`created_at`, COALESCE(t.`updated_at`, t.`created_at`)
FROM `tags` t JOIN `spaces` s ON s.`created_by` = t.`user_id`
ORDER BY t.`parent`;
--> statement-breakpoint
CREATE TABLE `items_new` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`folder_id` text,
	`kind` text DEFAULT 'link' NOT NULL,
	`title` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`body` text,
	`image` text DEFAULT '' NOT NULL,
	`favicon` text DEFAULT '' NOT NULL,
	`site_name` text DEFAULT '' NOT NULL,
	`color` text,
	`pinned` integer DEFAULT false NOT NULL,
	`position` text NOT NULL,
	`fetch_status` text DEFAULT 'done' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `items_new` (`id`, `space_id`, `folder_id`, `kind`, `title`, `url`, `description`, `notes`, `body`,
                         `image`, `position`, `created_by`, `created_at`, `updated_at`)
SELECT CAST(i.`id` AS TEXT), s.`id`, NULL, i.`type`, i.`title`, i.`url`, i.`description`, i.`comments`, i.`body`,
       i.`image`, '', i.`user_id`, i.`created_at`, COALESCE(i.`updated_at`, i.`created_at`)
FROM `items` i JOIN `spaces` s ON s.`created_by` = i.`user_id`;
--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`item_id`, `tag_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items_new`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags_new`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `item_tags` (`item_id`, `tag_id`)
SELECT CAST(`item_id` AS TEXT), CAST(`tag_id` AS TEXT) FROM `items_tags`;
--> statement-breakpoint
DROP TABLE `items_tags`;
--> statement-breakpoint
DROP TABLE `items`;
--> statement-breakpoint
DROP TABLE `tags`;
--> statement-breakpoint
ALTER TABLE `items_new` RENAME TO `items`;
--> statement-breakpoint
ALTER TABLE `tags_new` RENAME TO `tags`;
--> statement-breakpoint
CREATE INDEX `changes_space_seq_idx` ON `changes` (`space_id`,`seq`);
--> statement-breakpoint
CREATE INDEX `folders_space_idx` ON `folders` (`space_id`);
--> statement-breakpoint
CREATE INDEX `folders_parent_idx` ON `folders` (`parent_id`);
--> statement-breakpoint
CREATE INDEX `item_tags_tag_idx` ON `item_tags` (`tag_id`);
--> statement-breakpoint
CREATE INDEX `items_space_idx` ON `items` (`space_id`);
--> statement-breakpoint
CREATE INDEX `items_folder_idx` ON `items` (`folder_id`);
--> statement-breakpoint
CREATE INDEX `items_space_url_idx` ON `items` (`space_id`,`url`);
--> statement-breakpoint
CREATE INDEX `space_members_user_idx` ON `space_members` (`user_id`);
--> statement-breakpoint
CREATE INDEX `tags_space_idx` ON `tags` (`space_id`);
