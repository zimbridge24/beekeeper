ALTER TABLE `visits` ADD `weather_observed_at` integer;--> statement-breakpoint
ALTER TABLE `visits` ADD `temperature_c` real;--> statement-breakpoint
ALTER TABLE `visits` ADD `humidity_percent` real;--> statement-breakpoint
ALTER TABLE `visits` ADD `precipitation_mm` real;--> statement-breakpoint
ALTER TABLE `visits` ADD `wind_speed_ms` real;--> statement-breakpoint
ALTER TABLE `visits` ADD `weather_code` text;--> statement-breakpoint
ALTER TABLE `visits` ADD `weather_source` text;