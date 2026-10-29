CREATE TABLE `item_content` (
	`item_id` text PRIMARY KEY NOT NULL,
	`html` text NOT NULL,
	`text` text NOT NULL,
	`byline` text,
	`words` integer NOT NULL,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `folders` ADD `body` text;--> statement-breakpoint
ALTER TABLE `folders` ADD `notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `frameable` integer;