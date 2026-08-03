CREATE TABLE `facebook_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`page_name` text NOT NULL,
	`app_secret_encrypted` text NOT NULL,
	`page_access_token_encrypted` text NOT NULL,
	`connected_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
