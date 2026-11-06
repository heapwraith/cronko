CREATE TABLE `revoked_tokens` (
	`jti` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `revoked_tokens_expires_idx` ON `revoked_tokens` (`expires_at`);
