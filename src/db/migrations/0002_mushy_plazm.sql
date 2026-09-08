CREATE TABLE `record_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`record_id` text NOT NULL,
	`audio_local_uri` text,
	`audio_remote_path` text,
	`audio_duration_sec` real,
	`raw_transcript` text,
	`structuring_status` text DEFAULT 'pending_transcription' NOT NULL,
	`ai_confidence_score` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_status` text DEFAULT '기기 내 저장' NOT NULL,
	`last_synced_at` integer,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "record_transcripts_status_check" CHECK("record_transcripts"."structuring_status" IN ('pending_transcription','transcribing','pending_structuring','structuring','structured','failed')),
	CONSTRAINT "record_transcripts_sync_status_check" CHECK("record_transcripts"."sync_status" IN ('기기 내 저장','동기화 중','동기화 완료','동기화 실패'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `record_transcripts_record_unique` ON `record_transcripts` (`record_id`);