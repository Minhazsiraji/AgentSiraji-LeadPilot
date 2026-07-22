import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { businesses, followUpTasks, leadAnalyses, leadEvents, leads, replyDrafts } from "../db/schema";
import { analyzeLead, calculateScore, draftFollowUpReply, normalizeEmail, normalizeMessage, normalizePhone, temperatureFor } from "./lead-engine";
import type { BusinessProfile, LeadAnalysis, LeadInput, PipelineStatus } from "./types";
import { getCloudflareEnv } from "./runtime-env";
import { analyseWithOptionalAI, draftWithOptionalAI } from "./openai";

export const DEFAULT_BUSINESS_ID = "brighthome-cleaning";

export const defaultBusinessProfile: BusinessProfile = {
  name: "BrightHome Cleaning",
  description: "Reliable home and small-office cleaning with careful, friendly service.",
  timezone: "Europe/London",
  currency: "GBP",
  services: ["Deep cleaning", "Regular cleaning", "End-of-tenancy cleaning", "Office cleaning", "Move-in cleaning", "Move-out cleaning"],
  excludedServices: ["Appliance repair", "Carpet repair", "Pest control"],
  serviceAreas: ["London", "Westminster", "Camden", "Islington", "Hackney"],
  businessHours: "Monday–Friday, 08:00–18:00",
  responseTone: "Warm, concise and professional",
  qualificationFields: ["service", "location", "preferred_date", "budget_or_scope", "contact_information"],
  followUpDays: [1, 3, 7],
  prohibitedClaims: ["Do not confirm availability until the owner checks the calendar.", "Do not invent or guarantee a price."],
};

let schemaReady: Promise<void> | null = null;

export function ensureSchema() {
  schemaReady ??= createSchema();
  return schemaReady;
}

async function createSchema() {
  const d1 = getCloudflareEnv().DB;
  if (!d1) throw new Error("LeadPilot database is unavailable.");
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY, owner_email TEXT, name TEXT NOT NULL, description TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Europe/London', currency TEXT NOT NULL DEFAULT 'GBP',
      services_json TEXT NOT NULL, excluded_services_json TEXT NOT NULL DEFAULT '[]', service_areas_json TEXT NOT NULL,
      business_hours TEXT NOT NULL, response_tone TEXT NOT NULL DEFAULT 'Warm and professional',
      qualification_fields_json TEXT NOT NULL, follow_up_policy_json TEXT NOT NULL,
      prohibited_claims_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL, source TEXT NOT NULL, customer_name TEXT NOT NULL,
      email TEXT, phone TEXT, original_message TEXT NOT NULL, normalized_message TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'en',
      service_requested TEXT, location TEXT, budget_amount REAL, budget_currency TEXT, preferred_date TEXT,
      urgency TEXT NOT NULL DEFAULT 'low', purchase_intent TEXT NOT NULL DEFAULT 'low',
      service_fit TEXT NOT NULL DEFAULT 'unknown', location_fit TEXT NOT NULL DEFAULT 'unknown',
      lead_score INTEGER NOT NULL DEFAULT 0, temperature TEXT NOT NULL DEFAULT 'Cold', pipeline_status TEXT NOT NULL DEFAULT 'New',
      attention_state TEXT NOT NULL DEFAULT 'Needs Review', assigned_user TEXT, expected_value REAL NOT NULL DEFAULT 0,
      do_not_contact INTEGER NOT NULL DEFAULT 0, possible_spam INTEGER NOT NULL DEFAULT 0, duplicate_of TEXT,
      analysis_status TEXT NOT NULL DEFAULT 'complete', last_customer_activity_at TEXT, last_business_activity_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS lead_analyses (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, analysis_version TEXT NOT NULL DEFAULT '1.0',
      extracted_information_json TEXT NOT NULL, missing_information_json TEXT NOT NULL,
      recommended_next_action TEXT NOT NULL, confidence TEXT NOT NULL, model_used TEXT NOT NULL,
      score_breakdown_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS reply_drafts (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, draft_type TEXT NOT NULL DEFAULT 'first_response', subject TEXT,
      message TEXT NOT NULL, approval_status TEXT NOT NULL DEFAULT 'pending', approved_by TEXT, approved_at TEXT,
      sent_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS follow_up_tasks (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, sequence_step INTEGER NOT NULL, due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', draft_id TEXT, completed_at TEXT, cancelled_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS lead_events (
      id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, event_type TEXT NOT NULL, event_data_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS leads_business_created_idx ON leads (business_id, created_at DESC)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS leads_duplicate_idx ON leads (business_id, normalized_message, email, phone)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS analyses_lead_idx ON lead_analyses (lead_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS drafts_lead_idx ON reply_drafts (lead_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS followups_due_idx ON follow_up_tasks (status, due_at)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS events_lead_idx ON lead_events (lead_id, created_at DESC)"),
  ]);
}

export async function ensureBusiness() {
  await ensureSchema();
  const db = getDb();
  const existing = await db.select().from(businesses).where(eq(businesses.id, DEFAULT_BUSINESS_ID)).limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db.insert(businesses).values({
    id: DEFAULT_BUSINESS_ID,
    ownerEmail: null,
    name: defaultBusinessProfile.name,
    description: defaultBusinessProfile.description,
    timezone: defaultBusinessProfile.timezone,
    currency: defaultBusinessProfile.currency,
    servicesJson: JSON.stringify(defaultBusinessProfile.services),
    excludedServicesJson: JSON.stringify(defaultBusinessProfile.excludedServices),
    serviceAreasJson: JSON.stringify(defaultBusinessProfile.serviceAreas),
    businessHours: defaultBusinessProfile.businessHours,
    responseTone: defaultBusinessProfile.responseTone,
    qualificationFieldsJson: JSON.stringify(defaultBusinessProfile.qualificationFields),
    followUpPolicyJson: JSON.stringify(defaultBusinessProfile.followUpDays),
    prohibitedClaimsJson: JSON.stringify(defaultBusinessProfile.prohibitedClaims),
  }).returning();
  return created;
}

export async function claimBusiness(ownerEmail: string) {
  const business = await ensureBusiness();
  const normalized = ownerEmail.toLowerCase();
  const configuredOwner = business.ownerEmail?.toLowerCase();
  if (configuredOwner && configuredOwner !== normalized) throw new Error("FORBIDDEN_OWNER");
  if (!configuredOwner) {
    const db = getDb();
    const [claimed] = await db.update(businesses).set({ ownerEmail: normalized, updatedAt: new Date().toISOString() }).where(eq(businesses.id, DEFAULT_BUSINESS_ID)).returning();
    await seedWorkspace(normalized);
    return claimed;
  }
  await seedWorkspace(normalized);
  return business;
}

export function businessRowToProfile(row: typeof businesses.$inferSelect): BusinessProfile {
  return {
    name: row.name,
    description: row.description,
    timezone: row.timezone,
    currency: row.currency,
    services: safeArray(row.servicesJson),
    excludedServices: safeArray(row.excludedServicesJson),
    serviceAreas: safeArray(row.serviceAreasJson),
    businessHours: row.businessHours,
    responseTone: row.responseTone,
    qualificationFields: safeArray(row.qualificationFieldsJson),
    followUpDays: safeNumberArray(row.followUpPolicyJson),
    prohibitedClaims: safeArray(row.prohibitedClaimsJson),
  };
}

export async function createLead(input: Omit<LeadInput, "submittedAt"> & { submittedAt?: string; expectedValue?: number }, createdBy: string) {
  const business = await ensureBusiness();
  const profile = businessRowToProfile(business);
  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const cleanInput: LeadInput = {
    customerName: input.customerName.trim(),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
    message: input.message.trim(),
    source: input.source.trim() || "Manual",
    submittedAt,
  };
  const normalized = normalizeMessage(cleanInput.message);
  const db = getDb();
  const possibleDuplicates = await db.select().from(leads).where(and(eq(leads.businessId, DEFAULT_BUSINESS_ID), eq(leads.normalizedMessage, normalized))).orderBy(desc(leads.createdAt)).limit(5);
  const duplicate = possibleDuplicates.find((lead) =>
    (cleanInput.email && lead.email === cleanInput.email) ||
    (cleanInput.phone && lead.phone === cleanInput.phone) ||
    (!cleanInput.email && !cleanInput.phone)
  );
  if (duplicate) return { lead: duplicate, duplicate: true };

  const fallbackAnalysis = analyzeLead(cleanInput, profile);
  const { analysis, modelUsed } = await analyseWithOptionalAI(cleanInput, profile, fallbackAnalysis);
  const draft = await draftWithOptionalAI(cleanInput, analysis, profile);
  const leadId = crypto.randomUUID();
  const attentionState = analysis.doNotContact ? "Do Not Contact" : analysis.possibleSpam ? "Spam" : analysis.requiresHumanReview ? "Needs Review" : "Reply Approval";
  const [lead] = await db.insert(leads).values({
    id: leadId,
    businessId: DEFAULT_BUSINESS_ID,
    source: cleanInput.source,
    customerName: cleanInput.customerName,
    email: cleanInput.email,
    phone: cleanInput.phone,
    originalMessage: cleanInput.message,
    normalizedMessage: normalized,
    language: analysis.language,
    serviceRequested: analysis.serviceRequested,
    location: analysis.location,
    budgetAmount: analysis.budgetAmount,
    budgetCurrency: analysis.budgetCurrency,
    preferredDate: analysis.preferredDate,
    urgency: analysis.urgency,
    purchaseIntent: analysis.purchaseIntent,
    serviceFit: analysis.serviceFit,
    locationFit: analysis.locationFit,
    leadScore: analysis.score.total,
    temperature: analysis.temperature,
    pipelineStatus: "New",
    attentionState,
    assignedUser: business.ownerEmail,
    expectedValue: Math.max(0, input.expectedValue ?? 0),
    doNotContact: analysis.doNotContact,
    possibleSpam: analysis.possibleSpam,
    analysisStatus: "complete",
    lastCustomerActivityAt: submittedAt,
    createdAt: submittedAt,
    updatedAt: submittedAt,
  }).returning();

  await db.insert(leadAnalyses).values({
    id: crypto.randomUUID(),
    leadId,
    extractedInformationJson: JSON.stringify(analysis),
    missingInformationJson: JSON.stringify(analysis.missingInformation),
    recommendedNextAction: analysis.recommendedNextAction,
    confidence: analysis.confidence,
    modelUsed,
    scoreBreakdownJson: JSON.stringify(analysis.score),
  });
  if (draft) {
    await db.insert(replyDrafts).values({ id: crypto.randomUUID(), leadId, subject: draft.subject, message: draft.message, approvalStatus: "pending" });
    await db.insert(followUpTasks).values({ id: crypto.randomUUID(), leadId, sequenceStep: 1, dueAt: addBusinessDays(submittedAt, profile.followUpDays[0] ?? 1), status: "waiting_for_initial_reply" });
  }
  await recordEvent(leadId, "lead_received", { source: cleanInput.source, score: analysis.score.total, temperature: analysis.temperature }, createdBy);
  await recordEvent(leadId, "lead_analysed", { confidence: analysis.confidence, missingInformation: analysis.missingInformation }, "LeadPilot");
  if (draft) await recordEvent(leadId, "reply_drafted", { approvalStatus: "pending" }, "LeadPilot");
  return { lead, duplicate: false };
}

export async function getWorkspacePayload() {
  const business = await ensureBusiness();
  const db = getDb();
  const [leadRows, analysisRows, draftRows, followupRows, eventRows] = await Promise.all([
    db.select().from(leads).where(eq(leads.businessId, DEFAULT_BUSINESS_ID)).orderBy(desc(leads.createdAt)).limit(250),
    db.select().from(leadAnalyses).orderBy(desc(leadAnalyses.createdAt)),
    db.select().from(replyDrafts).orderBy(desc(replyDrafts.createdAt)),
    db.select().from(followUpTasks).orderBy(asc(followUpTasks.dueAt)),
    db.select().from(leadEvents).orderBy(desc(leadEvents.createdAt)).limit(1000),
  ]);
  const items = leadRows.map((lead) => ({
    ...lead,
    analysis: analysisRows.find((row) => row.leadId === lead.id) ?? null,
    draft: draftRows.find((row) => row.leadId === lead.id) ?? null,
    followUps: followupRows.filter((row) => row.leadId === lead.id),
    events: eventRows.filter((row) => row.leadId === lead.id).slice(0, 25),
  }));
  const legitimate = leadRows.filter((lead) => !lead.possibleSpam);
  const won = legitimate.filter((lead) => lead.pipelineStatus === "Won");
  const active = legitimate.filter((lead) => !["Won", "Lost"].includes(lead.pipelineStatus) && !lead.doNotContact);
  const now = new Date().toISOString();
  const due = followupRows.filter((task) => task.status === "pending" && task.dueAt <= now);
  const responseHours = leadRows
    .filter((lead) => lead.lastBusinessActivityAt)
    .map((lead) => (new Date(lead.lastBusinessActivityAt!).getTime() - new Date(lead.createdAt).getTime()) / 3_600_000)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return {
    business: { ...business, profile: businessRowToProfile(business) },
    leads: items,
    metrics: {
      newLeads: leadRows.filter((lead) => lead.pipelineStatus === "New").length,
      hotLeads: leadRows.filter((lead) => lead.temperature === "Hot" && !["Won", "Lost"].includes(lead.pipelineStatus)).length,
      followUpsDue: due.length,
      overdueFollowUps: due.filter((task) => task.dueAt < now).length,
      averageResponseHours: responseHours.length ? responseHours.reduce((sum, value) => sum + value, 0) / responseHours.length : 0,
      conversionRate: legitimate.length ? (won.length / legitimate.length) * 100 : 0,
      expectedPipelineValue: active.reduce((sum, lead) => sum + lead.expectedValue, 0),
    },
  };
}

export async function updateLead(leadId: string, patch: Record<string, unknown>, actor: string) {
  await ensureSchema();
  const db = getDb();
  const existing = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.businessId, DEFAULT_BUSINESS_ID))).limit(1);
  if (!existing[0]) return null;
  const allowedStatuses: PipelineStatus[] = ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"];
  const update: Partial<typeof leads.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (typeof patch.customerName === "string" && patch.customerName.trim()) update.customerName = patch.customerName.trim();
  if (typeof patch.email === "string" || patch.email === null) update.email = normalizeEmail(patch.email as string | null);
  if (typeof patch.phone === "string" || patch.phone === null) update.phone = normalizePhone(patch.phone as string | null);
  if (typeof patch.serviceRequested === "string" || patch.serviceRequested === null) update.serviceRequested = cleanNullable(patch.serviceRequested);
  if (typeof patch.location === "string" || patch.location === null) update.location = cleanNullable(patch.location);
  if (typeof patch.preferredDate === "string" || patch.preferredDate === null) update.preferredDate = cleanNullable(patch.preferredDate);
  if (typeof patch.expectedValue === "number" && Number.isFinite(patch.expectedValue)) update.expectedValue = Math.max(0, patch.expectedValue);
  if (typeof patch.pipelineStatus === "string" && allowedStatuses.includes(patch.pipelineStatus as PipelineStatus)) update.pipelineStatus = patch.pipelineStatus as PipelineStatus;
  if (typeof patch.doNotContact === "boolean") update.doNotContact = patch.doNotContact;
  await db.update(leads).set(update).where(eq(leads.id, leadId));
  const [current] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);

  const analysisRow = await db.select().from(leadAnalyses).where(eq(leadAnalyses.leadId, leadId)).orderBy(desc(leadAnalyses.createdAt)).limit(1);
  if (analysisRow[0]) {
    const previous = safeObject<LeadAnalysis>(analysisRow[0].extractedInformationJson);
    const knownCount = [current.serviceRequested, current.location, current.preferredDate, current.budgetAmount, current.email || current.phone].filter(Boolean).length;
    const score = calculateScore({
      serviceFit: current.serviceRequested ? "supported" : "unknown",
      purchaseIntent: { level: current.purchaseIntent as "high" | "medium" | "low" },
      urgency: { level: current.urgency as "high" | "medium" | "low" },
      knownQualificationCount: knownCount,
      hasClearAction: true,
    });
    const missing = [!current.serviceRequested && "service requested", !current.location && "service location", !current.preferredDate && "preferred date", !current.budgetAmount && "budget or scope", !(current.email || current.phone) && "contact information"].filter(Boolean);
    await db.update(leads).set({ leadScore: score.total, temperature: temperatureFor(score.total) }).where(eq(leads.id, leadId));
    await db.update(leadAnalyses).set({
      extractedInformationJson: JSON.stringify({ ...previous, serviceRequested: current.serviceRequested, location: current.location, preferredDate: current.preferredDate, missingInformation: missing, score, temperature: temperatureFor(score.total) }),
      missingInformationJson: JSON.stringify(missing),
      scoreBreakdownJson: JSON.stringify(score),
    }).where(eq(leadAnalyses.id, analysisRow[0].id));
  }
  const terminal = current.pipelineStatus === "Won" || current.pipelineStatus === "Lost" || current.doNotContact;
  if (terminal) {
    await db.update(followUpTasks).set({ status: "cancelled", cancelledReason: current.doNotContact ? "Do Not Contact" : `Lead marked ${current.pipelineStatus}` }).where(and(eq(followUpTasks.leadId, leadId), inArray(followUpTasks.status, ["pending", "waiting_for_approval"])));
  }
  await recordEvent(leadId, "lead_updated", { changed: Object.keys(update), pipelineStatus: current.pipelineStatus, doNotContact: current.doNotContact }, actor);
  return (await db.select().from(leads).where(eq(leads.id, leadId)).limit(1))[0];
}

export async function approveDraft(leadId: string, message: string, actor: string) {
  await ensureSchema();
  const db = getDb();
  const lead = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.businessId, DEFAULT_BUSINESS_ID))).limit(1);
  if (!lead[0] || lead[0].doNotContact || lead[0].possibleSpam || ["Won", "Lost"].includes(lead[0].pipelineStatus)) return null;
  const draft = await db.select().from(replyDrafts).where(eq(replyDrafts.leadId, leadId)).orderBy(desc(replyDrafts.createdAt)).limit(1);
  if (!draft[0]) return null;
  const now = new Date().toISOString();
  await db.update(replyDrafts).set({ message: message.trim() || draft[0].message, approvalStatus: "approved", approvedBy: actor, approvedAt: now, sentAt: now, updatedAt: now }).where(eq(replyDrafts.id, draft[0].id));
  await db.update(leads).set({ pipelineStatus: lead[0].pipelineStatus === "New" ? "Contacted" : lead[0].pipelineStatus, attentionState: "Waiting for Customer", lastBusinessActivityAt: now, updatedAt: now }).where(eq(leads.id, leadId));
  if (draft[0].draftType === "first_response") {
    await db.update(followUpTasks).set({ status: "pending" }).where(and(eq(followUpTasks.leadId, leadId), eq(followUpTasks.status, "waiting_for_initial_reply")));
  } else if (draft[0].draftType.startsWith("follow_up_")) {
    const task = await db.select().from(followUpTasks).where(and(eq(followUpTasks.leadId, leadId), eq(followUpTasks.draftId, draft[0].id))).limit(1);
    if (task[0]) {
      await db.update(followUpTasks).set({ status: "completed", completedAt: now }).where(eq(followUpTasks.id, task[0].id));
      const business = await ensureBusiness();
      const policy = businessRowToProfile(business).followUpDays;
      const nextStep = task[0].sequenceStep + 1;
      if (nextStep <= policy.length) {
        await db.insert(followUpTasks).values({ id: crypto.randomUUID(), leadId, sequenceStep: nextStep, dueAt: addBusinessDays(now, policy[nextStep - 1] ?? 7), status: "pending" });
      }
    }
  }
  await recordEvent(leadId, "reply_approved_and_recorded", { draftId: draft[0].id, edited: message.trim() !== draft[0].message }, actor);
  return true;
}

export async function prepareFollowUpDraft(taskId: string, actor: string) {
  await ensureSchema();
  const db = getDb();
  const task = await db.select().from(followUpTasks).where(eq(followUpTasks.id, taskId)).limit(1);
  if (!task[0] || task[0].status !== "pending") return null;
  const lead = await db.select().from(leads).where(and(eq(leads.id, task[0].leadId), eq(leads.businessId, DEFAULT_BUSINESS_ID))).limit(1);
  if (!lead[0]) return null;
  if (lead[0].doNotContact || lead[0].possibleSpam || ["Won", "Lost"].includes(lead[0].pipelineStatus)) {
    await db.update(followUpTasks).set({ status: "cancelled", cancelledReason: "Lead is closed or restricted" }).where(eq(followUpTasks.id, taskId));
    return null;
  }
  if (lead[0].lastCustomerActivityAt && lead[0].lastBusinessActivityAt && lead[0].lastCustomerActivityAt > lead[0].lastBusinessActivityAt) {
    await db.update(followUpTasks).set({ status: "cancelled", cancelledReason: "Customer replied" }).where(eq(followUpTasks.id, taskId));
    return null;
  }
  const business = await ensureBusiness();
  const analysisRow = await db.select().from(leadAnalyses).where(eq(leadAnalyses.leadId, lead[0].id)).orderBy(desc(leadAnalyses.createdAt)).limit(1);
  const analysis = analysisRow[0] ? safeObject<LeadAnalysis>(analysisRow[0].extractedInformationJson) : {};
  const safeAnalysis = { ...analysis, possibleSpam: lead[0].possibleSpam, doNotContact: lead[0].doNotContact, serviceRequested: lead[0].serviceRequested, suggestedQuestions: Array.isArray(analysis.suggestedQuestions) ? analysis.suggestedQuestions : [] } as LeadAnalysis;
  const draft = draftFollowUpReply({ customerName: lead[0].customerName, email: lead[0].email, phone: lead[0].phone, message: lead[0].originalMessage, source: lead[0].source, submittedAt: lead[0].createdAt }, safeAnalysis, businessRowToProfile(business), task[0].sequenceStep);
  if (!draft) return null;
  const draftId = crypto.randomUUID();
  await db.insert(replyDrafts).values({ id: draftId, leadId: lead[0].id, draftType: `follow_up_${task[0].sequenceStep}`, subject: draft.subject, message: draft.message, approvalStatus: "pending" });
  await db.update(followUpTasks).set({ status: "waiting_for_approval", draftId }).where(eq(followUpTasks.id, taskId));
  await db.update(leads).set({ attentionState: "Reply Approval", updatedAt: new Date().toISOString() }).where(eq(leads.id, lead[0].id));
  await recordEvent(lead[0].id, "follow_up_drafted", { taskId, sequenceStep: task[0].sequenceStep }, actor);
  return true;
}

export async function recordCustomerReply(leadId: string, message: string, actor: string) {
  await ensureSchema();
  const db = getDb();
  const lead = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.businessId, DEFAULT_BUSINESS_ID))).limit(1);
  if (!lead[0] || !message.trim()) return null;
  const now = new Date().toISOString();
  const doNotContact = /\b(stop (?:contacting|messaging|emailing) me|do not contact|don't contact|unsubscribe)\b/i.test(message);
  await db.update(leads).set({
    lastCustomerActivityAt: now,
    attentionState: doNotContact ? "Do Not Contact" : "Needs Reply",
    doNotContact: doNotContact || lead[0].doNotContact,
    updatedAt: now,
  }).where(eq(leads.id, leadId));
  await db.update(followUpTasks).set({ status: "cancelled", cancelledReason: doNotContact ? "Customer requested no contact" : "Customer replied" }).where(eq(followUpTasks.leadId, leadId));
  await recordEvent(leadId, "customer_reply_recorded", { message: message.trim().slice(0, 4000), doNotContact, followUpsCancelled: true }, actor);
  return true;
}

export async function updateFollowUp(taskId: string, status: "completed" | "cancelled", actor: string) {
  await ensureSchema();
  const db = getDb();
  const task = await db.select().from(followUpTasks).where(eq(followUpTasks.id, taskId)).limit(1);
  if (!task[0]) return null;
  const lead = await db.select().from(leads).where(and(eq(leads.id, task[0].leadId), eq(leads.businessId, DEFAULT_BUSINESS_ID))).limit(1);
  if (!lead[0]) return null;
  const now = new Date().toISOString();
  await db.update(followUpTasks).set({
    status,
    completedAt: status === "completed" ? now : null,
    cancelledReason: status === "cancelled" ? "Cancelled by owner" : null,
  }).where(eq(followUpTasks.id, taskId));
  await recordEvent(task[0].leadId, `follow_up_${status}`, { taskId, sequenceStep: task[0].sequenceStep }, actor);
  return true;
}

export async function deleteLead(leadId: string, actor: string) {
  await ensureSchema();
  const db = getDb();
  const lead = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.businessId, DEFAULT_BUSINESS_ID))).limit(1);
  if (!lead[0]) return false;
  await recordEvent(leadId, "customer_data_deleted", { customerName: lead[0].customerName }, actor);
  const d1 = getCloudflareEnv().DB;
  await d1.batch([
    d1.prepare("DELETE FROM lead_events WHERE lead_id = ?").bind(leadId),
    d1.prepare("DELETE FROM follow_up_tasks WHERE lead_id = ?").bind(leadId),
    d1.prepare("DELETE FROM reply_drafts WHERE lead_id = ?").bind(leadId),
    d1.prepare("DELETE FROM lead_analyses WHERE lead_id = ?").bind(leadId),
    d1.prepare("DELETE FROM leads WHERE id = ? AND business_id = ?").bind(leadId, DEFAULT_BUSINESS_ID),
  ]);
  return true;
}

export async function updateBusinessSettings(patch: Partial<BusinessProfile>) {
  const business = await ensureBusiness();
  const current = businessRowToProfile(business);
  const next = { ...current, ...patch };
  const db = getDb();
  const [updated] = await db.update(businesses).set({
    name: cleanRequired(next.name, current.name),
    description: cleanRequired(next.description, current.description),
    timezone: cleanRequired(next.timezone, current.timezone),
    currency: cleanRequired(next.currency, current.currency).toUpperCase().slice(0, 3),
    servicesJson: JSON.stringify(cleanStringArray(next.services, current.services)),
    excludedServicesJson: JSON.stringify(cleanStringArray(next.excludedServices, current.excludedServices)),
    serviceAreasJson: JSON.stringify(cleanStringArray(next.serviceAreas, current.serviceAreas)),
    businessHours: cleanRequired(next.businessHours, current.businessHours),
    responseTone: cleanRequired(next.responseTone, current.responseTone),
    qualificationFieldsJson: JSON.stringify(cleanStringArray(next.qualificationFields, current.qualificationFields)),
    followUpPolicyJson: JSON.stringify((next.followUpDays ?? current.followUpDays).map(Number).filter((value) => value > 0 && value <= 30).slice(0, 5)),
    prohibitedClaimsJson: JSON.stringify(cleanStringArray(next.prohibitedClaims, current.prohibitedClaims)),
    updatedAt: new Date().toISOString(),
  }).where(eq(businesses.id, DEFAULT_BUSINESS_ID)).returning();
  return updated;
}

async function seedWorkspace(actor: string) {
  const db = getDb();
  const count = await db.select({ id: leads.id }).from(leads).where(eq(leads.businessId, DEFAULT_BUSINESS_ID)).limit(1);
  if (count.length) return;
  const now = Date.now();
  const seed = [
    { customerName: "Emma Collins", email: "emma@example.com", phone: "", message: "I need deep cleaning for a three-bedroom apartment next Saturday. Please send the price.", source: "Website", expectedValue: 280, submittedAt: new Date(now - 18 * 60_000).toISOString() },
    { customerName: "Daniel Brooks", email: "daniel@example.com", phone: "+447700900122", message: "Looking for regular weekly cleaning in Camden for a two-bedroom flat. Are you available from next Friday?", source: "Manual", expectedValue: 560, submittedAt: new Date(now - 4 * 3_600_000).toISOString() },
    { customerName: "Sophie Carter", email: "sophie@example.com", phone: "", message: "Could I get a quote for end-of-tenancy cleaning in Hackney? The flat has two bedrooms.", source: "CSV import", expectedValue: 390, submittedAt: new Date(now - 28 * 3_600_000).toISOString() },
  ];
  for (const item of seed) await createLead(item, actor);
}

async function recordEvent(leadId: string, eventType: string, data: unknown, createdBy: string) {
  const db = getDb();
  await db.insert(leadEvents).values({ id: crypto.randomUUID(), leadId, eventType, eventDataJson: JSON.stringify(data), createdBy });
}

function addBusinessDays(iso: string, count: number) {
  const date = new Date(iso);
  let remaining = count;
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString();
}

function safeArray(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []; } catch { return []; }
}

function safeNumberArray(value: string): number[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : []; } catch { return []; }
}

function safeObject<T>(value: string): Partial<T> {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}

function cleanNullable(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function cleanRequired(value: unknown, fallback: string) { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function cleanStringArray(value: unknown, fallback: string[]) { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 50) : fallback; }
