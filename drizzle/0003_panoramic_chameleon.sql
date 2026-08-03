CREATE TABLE `whatsapp_contacts` (
	`wa_id` text PRIMARY KEY NOT NULL,
	`phone_number_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whatsapp_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`waba_id` text NOT NULL,
	`phone_number_id` text NOT NULL,
	`display_phone_number` text NOT NULL,
	`verified_name` text NOT NULL,
	`app_secret_encrypted` text NOT NULL,
	`access_token_encrypted` text NOT NULL,
	`connected_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whatsapp_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`wa_id` text NOT NULL,
	`phone_number_id` text NOT NULL,
	`lead_id` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text
);
