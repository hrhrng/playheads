ALTER TABLE `conversation` ADD `type` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation` ADD `isLiked` integer DEFAULT false NOT NULL;