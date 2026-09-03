CREATE TABLE `apiaries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`latitude` real,
	`longitude` real,
	`memo` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	CONSTRAINT "apiaries_sync_status_check" CHECK("apiaries"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE INDEX `apiaries_user_idx` ON `apiaries` (`user_id`,`is_archived`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `colonies` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`apiary_id` text NOT NULL,
	`internal_code` text NOT NULL,
	`alias` text NOT NULL,
	`species` text DEFAULT 'western' NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`apiary_id`) REFERENCES `apiaries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "colonies_sync_status_check" CHECK("colonies"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패')),
	CONSTRAINT "colonies_species_check" CHECK("colonies"."species" IN ('western','native'))
);
--> statement-breakpoint
CREATE INDEX `colonies_apiary_idx` ON `colonies` (`apiary_id`,`is_archived`);--> statement-breakpoint
CREATE UNIQUE INDEX `colonies_apiary_code_unique` ON `colonies` (`apiary_id`,`internal_code`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_table` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`payload_json` text NOT NULL,
	`watermark_at_enqueue` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	CONSTRAINT "outbox_op_check" CHECK("outbox"."op" IN ('insert','update','delete')),
	CONSTRAINT "outbox_status_check" CHECK("outbox"."status" IN ('pending','in_flight','failed'))
);
--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `outbox` (`status`,`id`);--> statement-breakpoint
CREATE INDEX `outbox_entity_idx` ON `outbox` (`entity_table`,`entity_id`);--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_table` text NOT NULL,
	`entity_id` text NOT NULL,
	`local_payload_json` text NOT NULL,
	`remote_payload_json` text NOT NULL,
	`detected_at` integer NOT NULL,
	`resolved_at` integer,
	`resolution` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_conflicts_open_unique` ON `sync_conflicts` (`entity_table`,`entity_id`) WHERE "sync_conflicts"."resolved_at" IS NULL;--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`table_name` text PRIMARY KEY NOT NULL,
	`last_pulled_at` integer DEFAULT 0 NOT NULL,
	`last_pull_status` text DEFAULT 'idle' NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`display_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
