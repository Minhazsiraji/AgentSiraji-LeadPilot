ALTER TABLE `whatsapp_integrations` ADD `connection_mode` text DEFAULT 'coexistence' NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_integrations` ADD `token_expires_at` text;--> statement-breakpoint
ALTER TABLE `whatsapp_integrations` ADD `verify_token_encrypted` text;