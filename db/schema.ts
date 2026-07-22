import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const businesses = sqliteTable("businesses", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  timezone: text("timezone").notNull().default("Europe/London"),
  currency: text("currency").notNull().default("GBP"),
  servicesJson: text("services_json").notNull(),
  excludedServicesJson: text("excluded_services_json").notNull().default("[]"),
  serviceAreasJson: text("service_areas_json").notNull(),
  businessHours: text("business_hours").notNull(),
  responseTone: text("response_tone").notNull().default("Warm and professional"),
  qualificationFieldsJson: text("qualification_fields_json").notNull(),
  followUpPolicyJson: text("follow_up_policy_json").notNull(),
  prohibitedClaimsJson: text("prohibited_claims_json").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  businessId: text("business_id").notNull(),
  source: text("source").notNull(),
  customerName: text("customer_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  originalMessage: text("original_message").notNull(),
  normalizedMessage: text("normalized_message").notNull(),
  language: text("language").notNull().default("en"),
  serviceRequested: text("service_requested"),
  location: text("location"),
  budgetAmount: real("budget_amount"),
  budgetCurrency: text("budget_currency"),
  preferredDate: text("preferred_date"),
  urgency: text("urgency").notNull().default("low"),
  purchaseIntent: text("purchase_intent").notNull().default("low"),
  serviceFit: text("service_fit").notNull().default("unknown"),
  locationFit: text("location_fit").notNull().default("unknown"),
  leadScore: integer("lead_score").notNull().default(0),
  temperature: text("temperature").notNull().default("Cold"),
  pipelineStatus: text("pipeline_status").notNull().default("New"),
  attentionState: text("attention_state").notNull().default("Needs Review"),
  assignedUser: text("assigned_user"),
  expectedValue: real("expected_value").notNull().default(0),
  doNotContact: integer("do_not_contact", { mode: "boolean" }).notNull().default(false),
  possibleSpam: integer("possible_spam", { mode: "boolean" }).notNull().default(false),
  duplicateOf: text("duplicate_of"),
  analysisStatus: text("analysis_status").notNull().default("complete"),
  lastCustomerActivityAt: text("last_customer_activity_at"),
  lastBusinessActivityAt: text("last_business_activity_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const leadAnalyses = sqliteTable("lead_analyses", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  analysisVersion: text("analysis_version").notNull().default("1.0"),
  extractedInformationJson: text("extracted_information_json").notNull(),
  missingInformationJson: text("missing_information_json").notNull(),
  recommendedNextAction: text("recommended_next_action").notNull(),
  confidence: text("confidence").notNull(),
  modelUsed: text("model_used").notNull(),
  scoreBreakdownJson: text("score_breakdown_json").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const replyDrafts = sqliteTable("reply_drafts", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  draftType: text("draft_type").notNull().default("first_response"),
  subject: text("subject"),
  message: text("message").notNull(),
  approvalStatus: text("approval_status").notNull().default("pending"),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const followUpTasks = sqliteTable("follow_up_tasks", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  sequenceStep: integer("sequence_step").notNull(),
  dueAt: text("due_at").notNull(),
  status: text("status").notNull().default("pending"),
  draftId: text("draft_id"),
  completedAt: text("completed_at"),
  cancelledReason: text("cancelled_reason"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const leadEvents = sqliteTable("lead_events", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  eventType: text("event_type").notNull(),
  eventDataJson: text("event_data_json").notNull().default("{}"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
