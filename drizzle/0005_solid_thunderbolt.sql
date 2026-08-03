PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_whatsapp_contacts` (
	`wa_id` text NOT NULL,
	`phone_number_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`wa_id`, `phone_number_id`)
);
--> statement-breakpoint
INSERT INTO `__new_whatsapp_contacts`("wa_id", "phone_number_id", "lead_id", "customer_name", "created_at", "updated_at") SELECT "wa_id", "phone_number_id", "lead_id", "customer_name", "created_at", "updated_at" FROM `whatsapp_contacts`;--> statement-breakpoint
DROP TABLE `whatsapp_contacts`;--> statement-breakpoint
ALTER TABLE `__new_whatsapp_contacts` RENAME TO `whatsapp_contacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;