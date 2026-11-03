CREATE TABLE `neurons` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`grounding` text NOT NULL,
	`endorsement` text NOT NULL,
	`provenance` text NOT NULL,
	`body` text NOT NULL,
	`file_path` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `synapses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_neuron_id` text NOT NULL,
	`target_neuron_id` text NOT NULL,
	`kind` text NOT NULL,
	`note` text,
	FOREIGN KEY (`source_neuron_id`) REFERENCES `neurons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_neuron_id`) REFERENCES `neurons`(`id`) ON UPDATE no action ON DELETE cascade
);
