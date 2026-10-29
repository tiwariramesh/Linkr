-- "Run again" copies remember their original. Written by hand: drizzle-kit leaves out ON DELETE here.
ALTER TABLE `folders` ADD `copied_from` text REFERENCES folders(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Full-text search (SQLite FTS5). One index per source table, each row keyed by the source row's
-- rowid so triggers can update it directly. Triggers keep the indexes in step with every write,
-- including rows removed by ON DELETE CASCADE. These tables are not part of the Drizzle schema.
CREATE VIRTUAL TABLE `items_fts` USING fts5(title, body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
--> statement-breakpoint
CREATE VIRTUAL TABLE `content_fts` USING fts5(body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
--> statement-breakpoint
CREATE VIRTUAL TABLE `highlights_fts` USING fts5(body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
--> statement-breakpoint
CREATE VIRTUAL TABLE `folders_fts` USING fts5(title, body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3');
--> statement-breakpoint

-- Items: the title, then the link, description and notes.
CREATE TRIGGER `items_fts_insert` AFTER INSERT ON `items` BEGIN
  INSERT INTO items_fts (rowid, title, body) VALUES (new.rowid, new.title, new.url || ' ' || new.description || ' ' || new.notes);
END;
--> statement-breakpoint
CREATE TRIGGER `items_fts_update` AFTER UPDATE OF title, url, description, notes ON `items` BEGIN
  UPDATE items_fts SET title = new.title, body = new.url || ' ' || new.description || ' ' || new.notes WHERE rowid = new.rowid;
END;
--> statement-breakpoint
CREATE TRIGGER `items_fts_delete` AFTER DELETE ON `items` BEGIN
  DELETE FROM items_fts WHERE rowid = old.rowid;
END;
--> statement-breakpoint

-- Reader copies: the article text.
CREATE TRIGGER `content_fts_insert` AFTER INSERT ON `item_content` BEGIN
  INSERT INTO content_fts (rowid, body) VALUES (new.rowid, new.text);
END;
--> statement-breakpoint
CREATE TRIGGER `content_fts_update` AFTER UPDATE OF text ON `item_content` BEGIN
  UPDATE content_fts SET body = new.text WHERE rowid = new.rowid;
END;
--> statement-breakpoint
CREATE TRIGGER `content_fts_delete` AFTER DELETE ON `item_content` BEGIN
  DELETE FROM content_fts WHERE rowid = old.rowid;
END;
--> statement-breakpoint

-- Highlights: the passage and its comment.
CREATE TRIGGER `highlights_fts_insert` AFTER INSERT ON `highlights` BEGIN
  INSERT INTO highlights_fts (rowid, body) VALUES (new.rowid, new.quote || ' ' || new.comment);
END;
--> statement-breakpoint
CREATE TRIGGER `highlights_fts_update` AFTER UPDATE OF quote, comment ON `highlights` BEGIN
  UPDATE highlights_fts SET body = new.quote || ' ' || new.comment WHERE rowid = new.rowid;
END;
--> statement-breakpoint
CREATE TRIGGER `highlights_fts_delete` AFTER DELETE ON `highlights` BEGIN
  DELETE FROM highlights_fts WHERE rowid = old.rowid;
END;
--> statement-breakpoint

-- Folders: the title, then the term and session notes.
CREATE TRIGGER `folders_fts_insert` AFTER INSERT ON `folders` BEGIN
  INSERT INTO folders_fts (rowid, title, body) VALUES (new.rowid, new.title, coalesce(new.term, '') || ' ' || new.notes);
END;
--> statement-breakpoint
CREATE TRIGGER `folders_fts_update` AFTER UPDATE OF title, term, notes ON `folders` BEGIN
  UPDATE folders_fts SET title = new.title, body = coalesce(new.term, '') || ' ' || new.notes WHERE rowid = new.rowid;
END;
--> statement-breakpoint
CREATE TRIGGER `folders_fts_delete` AFTER DELETE ON `folders` BEGIN
  DELETE FROM folders_fts WHERE rowid = old.rowid;
END;
--> statement-breakpoint

-- Index what is already there.
INSERT INTO items_fts (rowid, title, body) SELECT rowid, title, url || ' ' || description || ' ' || notes FROM items;
--> statement-breakpoint
INSERT INTO content_fts (rowid, body) SELECT rowid, text FROM item_content;
--> statement-breakpoint
INSERT INTO highlights_fts (rowid, body) SELECT rowid, quote || ' ' || comment FROM highlights;
--> statement-breakpoint
INSERT INTO folders_fts (rowid, title, body) SELECT rowid, title, coalesce(term, '') || ' ' || notes FROM folders;
