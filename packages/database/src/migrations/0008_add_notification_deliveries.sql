CREATE TABLE IF NOT EXISTS `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`monitor_name` text NOT NULL,
	`event` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notification_deliveries_due_idx` ON `notification_deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notification_deliveries_created_idx` ON `notification_deliveries` (`created_at`);
