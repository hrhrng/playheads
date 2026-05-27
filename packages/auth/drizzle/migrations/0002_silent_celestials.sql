-- Topic playlist: each conversation owns the queue of tracks added by the LLM
-- during that session. Becomes the "topic" — restored on re-open.
ALTER TABLE `conversation` ADD `playlist` text DEFAULT '[]' NOT NULL;
