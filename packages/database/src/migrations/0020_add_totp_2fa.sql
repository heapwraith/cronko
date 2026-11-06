ALTER TABLE `users` ADD `totp_secret` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `totp_last_step` integer;
--> statement-breakpoint
CREATE TABLE `recovery_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `recovery_codes_user_idx` ON `recovery_codes` (`user_id`);
