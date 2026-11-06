ALTER TABLE `heartbeats` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `heartbeats` ADD `overlapped` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Older finish rows are recognisable by their marker body.
UPDATE `heartbeats` SET `kind` = 'finish' WHERE `body` = 'pulse:finish';
