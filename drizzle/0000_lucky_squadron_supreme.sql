CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`timezone` text DEFAULT 'Europe/London' NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`services_json` text NOT NULL,
	`excluded_services_json` text DEFAULT '[]' NOT NULL,
	`service_areas_json` text NOT NULL,
	`business_hours` text NOT NULL,
	`response_tone` text DEFAULT 'Warm and professional' NOT NULL,
	`qualification_fields_json` text NOT NULL,
	`follow_up_policy_json` text NOT NULL,
	`prohibited_claims_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `follow_up_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`sequence_step` integer NOT NULL,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`draft_id` text,
	`completed_at` text,
	`cancelled_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lead_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`analysis_version` text DEFAULT '1.0' NOT NULL,
	`extracted_information_json` text NOT NULL,
	`missing_information_json` text NOT NULL,
	`recommended_next_action` text NOT NULL,
	`confidence` text NOT NULL,
	`model_used` text NOT NULL,
	`score_breakdown_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lead_events` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_data_json` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`source` text NOT NULL,
	`customer_name` text NOT NULL,
	`email` text,
	`phone` text,
	`original_message` text NOT NULL,
	`normalized_message` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`service_requested` text,
	`location` text,
	`budget_amount` real,
	`budget_currency` text,
	`preferred_date` text,
	`urgency` text DEFAULT 'low' NOT NULL,
	`purchase_intent` text DEFAULT 'low' NOT NULL,
	`service_fit` text DEFAULT 'unknown' NOT NULL,
	`location_fit` text DEFAULT 'unknown' NOT NULL,
	`lead_score` integer DEFAULT 0 NOT NULL,
	`temperature` text DEFAULT 'Cold' NOT NULL,
	`pipeline_status` text DEFAULT 'New' NOT NULL,
	`attention_state` text DEFAULT 'Needs Review' NOT NULL,
	`assigned_user` text,
	`expected_value` real DEFAULT 0 NOT NULL,
	`do_not_contact` integer DEFAULT false NOT NULL,
	`possible_spam` integer DEFAULT false NOT NULL,
	`duplicate_of` text,
	`analysis_status` text DEFAULT 'complete' NOT NULL,
	`last_customer_activity_at` text,
	`last_business_activity_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reply_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`draft_type` text DEFAULT 'first_response' NOT NULL,
	`subject` text,
	`message` text NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`sent_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
