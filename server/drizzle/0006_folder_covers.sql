ALTER TABLE `folders` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `folders` ADD `cover` text;--> statement-breakpoint
-- Search also covers folder descriptions: rebuild the folder triggers and re-index folders.
DROP TRIGGER `folders_fts_insert`;
--> statement-breakpoint
DROP TRIGGER `folders_fts_update`;
--> statement-breakpoint
CREATE TRIGGER `folders_fts_insert` AFTER INSERT ON `folders` BEGIN
  INSERT INTO folders_fts (rowid, title, body) VALUES (new.rowid, new.title, coalesce(new.term, '') || ' ' || new.description || ' ' || new.notes);
END;
--> statement-breakpoint
CREATE TRIGGER `folders_fts_update` AFTER UPDATE OF title, term, description, notes ON `folders` BEGIN
  UPDATE folders_fts SET title = new.title, body = coalesce(new.term, '') || ' ' || new.description || ' ' || new.notes WHERE rowid = new.rowid;
END;
--> statement-breakpoint
DELETE FROM folders_fts;
--> statement-breakpoint
INSERT INTO folders_fts (rowid, title, body) SELECT rowid, title, coalesce(term, '') || ' ' || description || ' ' || notes FROM folders;
