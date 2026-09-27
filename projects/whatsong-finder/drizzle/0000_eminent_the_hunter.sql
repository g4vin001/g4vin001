CREATE TABLE `cache` (
	`key` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cache_expires` ON `cache` (`expires`);--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`owner` text NOT NULL,
	`ip` text NOT NULL,
	`digest` text NOT NULL,
	`created` integer NOT NULL,
	`response` text
);
--> statement-breakpoint
CREATE INDEX `idx_operations_kind_created` ON `operations` (`kind`,`created`);--> statement-breakpoint
CREATE INDEX `idx_operations_owner_kind_created` ON `operations` (`owner`,`kind`,`created`);--> statement-breakpoint
CREATE INDEX `idx_operations_ip_kind_created` ON `operations` (`ip`,`kind`,`created`);--> statement-breakpoint
CREATE TABLE `saved` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`song` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_saved_owner_created` ON `saved` (`owner`,`created`);