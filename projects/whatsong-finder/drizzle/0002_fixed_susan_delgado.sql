CREATE TABLE `recognition_meter` (
	`id` text PRIMARY KEY NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO recognition_meter(id,used) SELECT 'global',COUNT(*) FROM operations WHERE kind='recognize';
--> statement-breakpoint
CREATE TRIGGER count_recognition_reservation AFTER INSERT ON operations
WHEN NEW.kind='recognize'
BEGIN
  INSERT INTO recognition_meter(id,used) VALUES('global',1)
  ON CONFLICT(id) DO UPDATE SET used=recognition_meter.used+1;
END;
