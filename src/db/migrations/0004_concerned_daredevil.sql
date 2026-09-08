CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`local_uri` text NOT NULL,
	`remote_path` text,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "photos_sync_status_check" CHECK("photos"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE INDEX `photos_record_idx` ON `photos` (`record_id`);