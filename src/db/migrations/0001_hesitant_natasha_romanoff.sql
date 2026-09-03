CREATE TABLE `record_field_values` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`category` text NOT NULL,
	`field_key` text NOT NULL,
	`value_state` text DEFAULT 'unset' NOT NULL,
	`value_text` text,
	`value_number` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "record_field_values_category_check" CHECK("record_field_values"."category" IN ('observation','problem','action','result')),
	CONSTRAINT "record_field_values_state_check" CHECK("record_field_values"."value_state" IN ('present','absent','unknown','unset')),
	CONSTRAINT "record_field_values_sync_status_check" CHECK("record_field_values"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_field_values_unique` ON `record_field_values` (`record_id`,`field_key`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`colony_id` text NOT NULL,
	`input_method` text NOT NULL,
	`record_type` text NOT NULL,
	`confirmation_status` text DEFAULT 'confirmed' NOT NULL,
	`notes` text,
	`occurred_at` integer NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`colony_id`) REFERENCES `colonies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "records_input_method_check" CHECK("records"."input_method" IN ('voice_ai','quick_select')),
	CONSTRAINT "records_record_type_check" CHECK("records"."record_type" IN ('general_observation','pest_disease','feeding','treatment','honey_harvest','swarm_split_requeen','wintering_dissolution')),
	CONSTRAINT "records_confirmation_status_check" CHECK("records"."confirmation_status" IN ('draft','confirmed')),
	CONSTRAINT "records_sync_status_check" CHECK("records"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE INDEX `records_colony_idx` ON `records` (`colony_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `records_visit_idx` ON `records` (`visit_id`);--> statement-breakpoint
CREATE TABLE `visit_colonies` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`colony_id` text NOT NULL,
	`sequence_order` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`colony_id`) REFERENCES `colonies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "visit_colonies_status_check" CHECK("visit_colonies"."status" IN ('pending','in_progress','done','skipped')),
	CONSTRAINT "visit_colonies_sync_status_check" CHECK("visit_colonies"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE INDEX `visit_colonies_visit_idx` ON `visit_colonies` (`visit_id`,`sequence_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `visit_colonies_unique` ON `visit_colonies` (`visit_id`,`colony_id`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`apiary_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`latitude` real,
	`longitude` real,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`apiary_id`) REFERENCES `apiaries`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "visits_status_check" CHECK("visits"."status" IN ('in_progress','completed')),
	CONSTRAINT "visits_sync_status_check" CHECK("visits"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE INDEX `visits_apiary_idx` ON `visits` (`apiary_id`,`started_at`);