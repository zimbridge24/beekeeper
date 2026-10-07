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
	CONSTRAINT "record_field_values_state_check" CHECK("__new_record_field_values"."value_state" IN ('present','absent','unknown','not_tested','tested_negative','tested_positive','indeterminate','done','not_done','asian_hornet','giant_hornet','other','unknown_species','none','few_1_5','several_6_20','many_20_plus','strong','normal','weak','enough','low','partial','good','needs_check','survived','weak_survived','lost','comb_count','sugar_roll','alcohol_wash','sticky_board','drone_brood','visual','other_method','amitraz','coumaphos','formic_acid','oxalic_acid','other_ingredient','unknown_ingredient','sugar_syrup','pollen_cake','honey_feed','other_feed','kg','liter','unset')),
	CONSTRAINT "record_field_values_ai_draft_state_check" CHECK("__new_record_field_values"."ai_draft_value_state" IS NULL OR "__new_record_field_values"."ai_draft_value_state" IN ('present','absent','unknown','not_tested','tested_negative','tested_positive','indeterminate','done','not_done','asian_hornet','giant_hornet','other','unknown_species','none','few_1_5','several_6_20','many_20_plus','strong','normal','weak','enough','low','partial','good','needs_check','survived','weak_survived','lost','comb_count','sugar_roll','alcohol_wash','sticky_board','drone_brood','visual','other_method','amitraz','coumaphos','formic_acid','oxalic_acid','other_ingredient','unknown_ingredient','sugar_syrup','pollen_cake','honey_feed','other_feed','kg','liter','unset')),
	CONSTRAINT "record_field_values_sync_status_check" CHECK("__new_record_field_values"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
INSERT INTO `__new_record_field_values`("id", "user_id", "record_id", "category", "field_key", "value_state", "ai_draft_value_state", "value_text", "value_number", "ai_draft_value_number", "ai_draft_value_text", "created_at", "updated_at", "sync_status", "last_synced_at") SELECT "id", "user_id", "record_id", "category", "field_key", "value_state", "ai_draft_value_state", "value_text", "value_number", "ai_draft_value_number", "ai_draft_value_text", "created_at", "updated_at", "sync_status", "last_synced_at" FROM `record_field_values`;--> statement-breakpoint
DROP TABLE `record_field_values`;--> statement-breakpoint
ALTER TABLE `__new_record_field_values` RENAME TO `record_field_values`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `record_field_values_unique` ON `record_field_values` (`record_id`,`field_key`);