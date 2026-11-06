ALTER TABLE `heartbeats` ADD `run_id` text;--> statement-breakpoint
CREATE INDEX `heartbeats_monitor_run_idx` ON `heartbeats` (`monitor_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `ping_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text NOT NULL,
	`received_at` integer NOT NULL,
	`source_ip` text,
	`user_agent` text,
	`body` text,
	`run_id` text,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ping_logs_monitor_received_idx` ON `ping_logs` (`monitor_id`,`received_at`);
