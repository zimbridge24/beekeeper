CREATE TABLE `colony_hive_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`colony_id` text NOT NULL,
	`hive_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`colony_id`) REFERENCES `colonies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`hive_id`) REFERENCES `hives`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cha_sync_status_check" CHECK("colony_hive_assignments"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE INDEX `cha_colony_idx` ON `colony_hive_assignments` (`colony_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `cha_hive_idx` ON `colony_hive_assignments` (`hive_id`,`started_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `cha_colony_open_unique` ON `colony_hive_assignments` (`colony_id`) WHERE "colony_hive_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `cha_hive_open_unique` ON `colony_hive_assignments` (`hive_id`) WHERE "colony_hive_assignments"."ended_at" IS NULL;--> statement-breakpoint
CREATE TABLE `hives` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`apiary_id` text NOT NULL,
	`code` text NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`apiary_id`) REFERENCES `apiaries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "hives_sync_status_check" CHECK("hives"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE INDEX `hives_apiary_idx` ON `hives` (`apiary_id`,`is_archived`);--> statement-breakpoint
CREATE UNIQUE INDEX `hives_apiary_code_unique` ON `hives` (`apiary_id`,`code`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_record_field_values` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`category` text NOT NULL,
	`field_key` text NOT NULL,
	`value_state` text DEFAULT 'unset' NOT NULL,
	`ai_draft_value_state` text,
	`value_text` text,
	`value_number` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "record_field_values_category_check" CHECK("__new_record_field_values"."category" IN ('observation','problem','action','result')),
	CONSTRAINT "record_field_values_state_check" CHECK("__new_record_field_values"."value_state" IN ('present','absent','unknown','not_tested','tested_negative','tested_positive','indeterminate','done','not_done','asian_hornet','giant_hornet','other','unknown_species','none','few_1_5','several_6_20','many_20_plus','unset')),
	CONSTRAINT "record_field_values_ai_draft_state_check" CHECK("__new_record_field_values"."ai_draft_value_state" IS NULL OR "__new_record_field_values"."ai_draft_value_state" IN ('present','absent','unknown','not_tested','tested_negative','tested_positive','indeterminate','done','not_done','asian_hornet','giant_hornet','other','unknown_species','none','few_1_5','several_6_20','many_20_plus','unset')),
	CONSTRAINT "record_field_values_sync_status_check" CHECK("__new_record_field_values"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
INSERT INTO `__new_record_field_values`("id", "user_id", "record_id", "category", "field_key", "value_state", "ai_draft_value_state", "value_text", "value_number", "created_at", "updated_at", "sync_status", "last_synced_at") SELECT "id", "user_id", "record_id", "category", "field_key", "value_state", NULL, "value_text", "value_number", "created_at", "updated_at", "sync_status", "last_synced_at" FROM `record_field_values`;--> statement-breakpoint
DROP TABLE `record_field_values`;--> statement-breakpoint
ALTER TABLE `__new_record_field_values` RENAME TO `record_field_values`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `record_field_values_unique` ON `record_field_values` (`record_id`,`field_key`);--> statement-breakpoint
ALTER TABLE `record_transcripts` ADD `ai_draft_record_type` text;--> statement-breakpoint
ALTER TABLE `record_transcripts` ADD `ai_draft_colony_id` text;--> statement-breakpoint
ALTER TABLE `record_transcripts` ADD `ai_draft_notes` text;