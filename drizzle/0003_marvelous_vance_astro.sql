CREATE TABLE `neuron_index_state` (
	`id` text PRIMARY KEY NOT NULL,
	`checked_at` integer NOT NULL,
	`neuron_count` integer NOT NULL,
	`synapse_count` integer NOT NULL,
	`directory_stamp` text NOT NULL,
	`catalog_stamp` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `neurons` ADD `file_stamp` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `neurons` ADD `retrieval_cues` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `synapses_source_idx` ON `synapses` (`source_neuron_id`);--> statement-breakpoint
CREATE INDEX `synapses_target_idx` ON `synapses` (`target_neuron_id`);