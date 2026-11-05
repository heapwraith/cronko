-- Indexes were declared in schema.ts but never created by a migration.
CREATE INDEX IF NOT EXISTS `heartbeats_monitor_received_idx` ON `heartbeats` (`monitor_id`,`received_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `incidents_monitor_status_idx` ON `incidents` (`monitor_id`,`status`);
