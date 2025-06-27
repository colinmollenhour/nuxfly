CREATE TABLE `todo` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL
);
