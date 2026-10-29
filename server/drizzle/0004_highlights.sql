CREATE TABLE `highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`item_id` text NOT NULL,
	`quote` text NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`suffix` text DEFAULT '' NOT NULL,
	`start` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT 'yellow' NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `highlights_item_idx` ON `highlights` (`item_id`);--> statement-breakpoint
CREATE INDEX `highlights_space_idx` ON `highlights` (`space_id`);