CREATE TABLE IF NOT EXISTS `status_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`tag` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `status_pages_slug_unique` ON `status_pages` (`slug`);
