CREATE TABLE IF NOT EXISTS `maintenance_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`schedule` text NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`duration_minutes` integer NOT NULL,
	`target` text NOT NULL,
	`target_value` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
