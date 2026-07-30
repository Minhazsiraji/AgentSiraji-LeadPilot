CREATE TABLE `facebook_contacts` (
	`sender_id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `facebook_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`page_id` text NOT NULL,
	`lead_id` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `owner_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`type` text DEFAULT 'new_order' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
