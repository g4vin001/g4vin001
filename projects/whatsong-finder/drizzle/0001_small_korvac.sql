CREATE TABLE `scan_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`input` text NOT NULL,
	`input_hash` text NOT NULL,
	`created` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_scan_jobs_owner_created` ON `scan_jobs` (`owner`,`created`);--> statement-breakpoint
CREATE INDEX `idx_scan_jobs_expires` ON `scan_jobs` (`expires`);--> statement-breakpoint
CREATE TABLE `scan_segments` (
	`job_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`media_hash` text,
	`claimed` integer,
	`result` text,
	PRIMARY KEY(`job_id`, `ordinal`),
	FOREIGN KEY (`job_id`) REFERENCES `scan_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
