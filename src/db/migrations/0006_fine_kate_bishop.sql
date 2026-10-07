CREATE TABLE `ai_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`kind` text NOT NULL,
	`confidence` text,
	`photo_quality` text,
	`retake_needed` integer DEFAULT false NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ai_analyses_kind_check" CHECK("ai_analyses"."kind" IN ('mite_photo','hornet_photo','wintering_photo')),
	CONSTRAINT "ai_analyses_confidence_check" CHECK("ai_analyses"."confidence" IS NULL OR "ai_analyses"."confidence" IN ('low','medium','high')),
	CONSTRAINT "ai_analyses_photo_quality_check" CHECK("ai_analyses"."photo_quality" IS NULL OR "ai_analyses"."photo_quality" IN ('good','fair','poor')),
	CONSTRAINT "ai_analyses_sync_status_check" CHECK("ai_analyses"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE INDEX `ai_analyses_record_idx` ON `ai_analyses` (`record_id`);--> statement-breakpoint
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
	`ai_draft_value_number` real,
	`ai_draft_value_text` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "record_field_values_category_check" CHECK("__new_record_field_values"."category" IN ('observation','problem','action','result')),
	CONSTRAINT "record_field_values_state_check" CHECK("__new_record_field_values"."value_state" IN ('present','absent','unknown','not_tested','tested_negative','tested_positive','indeterminate','done','not_done','asian_hornet','giant_hornet','other','unknown_species','none','few_1_5','several_6_20','many_20_plus','strong','normal','weak','enough','low','partial','good','needs_check','survived','weak_survived','lost','sugar_roll','alcohol_wash','sticky_board','drone_brood','visual','other_method','sugar_syrup','pollen_cake','honey_feed','other_feed','kg','liter','unset')),
	CONSTRAINT "record_field_values_ai_draft_state_check" CHECK("__new_record_field_values"."ai_draft_value_state" IS NULL OR "__new_record_field_values"."ai_draft_value_state" IN ('present','absent','unknown','not_tested','tested_negative','tested_positive','indeterminate','done','not_done','asian_hornet','giant_hornet','other','unknown_species','none','few_1_5','several_6_20','many_20_plus','strong','normal','weak','enough','low','partial','good','needs_check','survived','weak_survived','lost','sugar_roll','alcohol_wash','sticky_board','drone_brood','visual','other_method','sugar_syrup','pollen_cake','honey_feed','other_feed','kg','liter','unset')),
	CONSTRAINT "record_field_values_sync_status_check" CHECK("__new_record_field_values"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
INSERT INTO `__new_record_field_values`("id", "user_id", "record_id", "category", "field_key", "value_state", "ai_draft_value_state", "value_text", "value_number", "ai_draft_value_number", "ai_draft_value_text", "created_at", "updated_at", "sync_status", "last_synced_at") SELECT "id", "user_id", "record_id", "category", "field_key", "value_state", "ai_draft_value_state", "value_text", "value_number", NULL, NULL, "created_at", "updated_at", "sync_status", "last_synced_at" FROM `record_field_values`;--> statement-breakpoint
DROP TABLE `record_field_values`;--> statement-breakpoint
ALTER TABLE `__new_record_field_values` RENAME TO `record_field_values`;--> statement-breakpoint
CREATE UNIQUE INDEX `record_field_values_unique` ON `record_field_values` (`record_id`,`field_key`);--> statement-breakpoint
CREATE TABLE `__new_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`colony_id` text NOT NULL,
	`input_method` text NOT NULL,
	`record_type` text NOT NULL,
	`confirmation_status` text DEFAULT 'confirmed' NOT NULL,
	`notes` text,
	`capture_group_id` text,
	`occurred_at` integer NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`colony_id`) REFERENCES `colonies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "records_input_method_check" CHECK("__new_records"."input_method" IN ('voice_ai','quick_select','photo_ai')),
	CONSTRAINT "records_record_type_check" CHECK("__new_records"."record_type" IN ('general_observation','mite','hornet','pest_disease','treatment','feeding','swarm_split_requeen','wintering_prep','wintering_dissolution','honey_harvest')),
	CONSTRAINT "records_confirmation_status_check" CHECK("__new_records"."confirmation_status" IN ('draft','confirmed')),
	CONSTRAINT "records_sync_status_check" CHECK("__new_records"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
INSERT INTO `__new_records`("id", "user_id", "visit_id", "colony_id", "input_method", "record_type", "confirmation_status", "notes", "capture_group_id", "occurred_at", "deleted_at", "created_at", "updated_at", "sync_status", "last_synced_at") SELECT "id", "user_id", "visit_id", "colony_id", "input_method", "record_type", "confirmation_status", "notes", NULL, "occurred_at", "deleted_at", "created_at", "updated_at", "sync_status", "last_synced_at" FROM `records`;--> statement-breakpoint
DROP TABLE `records`;--> statement-breakpoint
ALTER TABLE `__new_records` RENAME TO `records`;--> statement-breakpoint
CREATE INDEX `records_colony_idx` ON `records` (`colony_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `records_capture_group_idx` ON `records` (`capture_group_id`);--> statement-breakpoint
CREATE INDEX `records_visit_idx` ON `records` (`visit_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
