ALTER TABLE `neurons` ADD `aliases` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `neurons` ADD `topics` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `neurons` ADD `sources` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `neurons` ADD `lifecycle` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `neurons` ADD `superseded_by` text;--> statement-breakpoint
ALTER TABLE `neurons` ADD `revision` text DEFAULT '' NOT NULL;