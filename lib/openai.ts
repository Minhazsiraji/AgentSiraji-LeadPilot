import { calculateScore, draftFirstReply, temperatureFor } from "./lead-engine";
import { FIRST_RESPONSE_PROMPT, LEAD_EXTRACTION_PROMPT } from "./prompts";
import { getCloudflareEnv } from "./runtime-env";
import type { BusinessProfile, FitLevel, LeadAnalysis, LeadInput, Level, ReplyDraft } from "./types";

type AiExtraction = {
  language: string;
  message_type: string;
  service_requested: string | null;
  location: string | null;
  budget_amount: number | null;
  budget_currency: string | null;
  preferred_date: string | null;
  preferred_date_text: string | null;
  scope_details: string[];
  urgency: Level;
  urgency_reason: string;
  purchase_intent: Level;
  purchase_intent_reason: string;
  service_fit: FitLevel;
  location_fit: FitLevel;
  known_facts: string[];
  missing_information: string[];
  recommended_next_action: string;
  suggested_questions: string[];
  possible_spam: boolean;
  do_not_contact: boolean;
  requires_human_review: boolean;
  overall_confidence: Level;
};

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["language", "message_type", "service_requested", "location", "budget_amount", "budget_currency", "preferred_date", "preferred_date_text", "scope_details", "urgency", "urgency_reason", "purchase_intent", "purchase_intent_reason", "service_fit", "location_fit", "known_facts", "missing_information", "recommended_next_action", "suggested_questions", "possible_spam", "do_not_contact", "requires_human_review", "overall_confidence"],
  properties: {
    language: { type: "string" },
    message_type: { type: "string", enum: ["sales_enquiry", "support_request", "job_application", "vendor_message", "spam", "other"] },
    service_requested: nullableString,
    location: nullableString,
    budget_amount: { anyOf: [{ type: "number" }, { type: "null" }] },
    budget_currency: nullableString,
    preferred_date: nullableString,
    preferred_date_text: nullableString,
    scope_details: { type: "array", items: { type: "string" } },
    urgency: { type: "string", enum: ["high", "medium", "low"] },
    urgency_reason: { type: "string" },
    purchase_intent: { type: "string", enum: ["high", "medium", "low"] },
    purchase_intent_reason: { type: "string" },
    service_fit: { type: "string", enum: ["supported", "unsupported", "unknown"] },
    location_fit: { type: "string", enum: ["supported", "unsupported", "unknown"] },
    known_facts: { type: "array", items: { type: "string" } },
    missing_information: { type: "array", items: { type: "string" } },
    recommended_next_action: { type: "string" },
    suggested_questions: { type: "array", maxItems: 3, items: { type: "string" } },
    possible_spam: { type: "boolean" },
    do_not_contact: { type: "boolean" },
    requires_human_review: { type: "boolean" },
    overall_confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
};

const replySchema = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "message", "requested_information", "proposed_next_action", "requires_human_review", "review_reason"],
  properties: {
    subject: nullableString,
    message: { type: "string" },
    requested_information: { type: "array", maxItems: 2, items: { type: "string" } },
    proposed_next_action: { type: "string" },
    requires_human_review: { type: "boolean" },
    review_reason: nullableString,
  },
};

export async function analyseWithOptionalAI(input: LeadInput, business: BusinessProfile, fallback: LeadAnalysis) {
  const configured = configuration();
  if (!configured) return { analysis: fallback, modelUsed: "leadpilot-rules-v1" };
  try {
    const extracted = await callStructured<AiExtraction>(configured, "leadpilot_lead_analysis", extractionSchema, LEAD_EXTRACTION_PROMPT, JSON.stringify({ submitted_at: input.submittedAt, business_timezone: business.timezone, lead_source: input.source, customer: { name: input.customerName, email: input.email, phone: input.phone }, business_profile: business, customer_message: input.message }));
    const missing = extracted.missing_information.slice(0, 10);
    const knownQualificationCount = [extracted.service_requested, extracted.location, extracted.preferred_date, extracted.budget_amount || extracted.scope_details.length, input.email || input.phone].filter(Boolean).length;
    const score = calculateScore({ serviceFit: extracted.service_fit, purchaseIntent: { level: extracted.purchase_intent }, urgency: { level: extracted.urgency }, knownQualificationCount, hasClearAction: /\?|\b(price|quote|book|availability|call|send|need|want)\b/i.test(input.message) });
    const possibleSpam = fallback.possibleSpam || extracted.possible_spam;
    const doNotContact = fallback.doNotContact || extracted.do_not_contact;
    const analysis: LeadAnalysis = {
      language: extracted.language.slice(0, 12) || fallback.language,
      messageType: possibleSpam ? "spam" : validMessageType(extracted.message_type),
      serviceRequested: cleanNullable(extracted.service_requested),
      location: cleanNullable(extracted.location),
      budgetAmount: finiteOrNull(extracted.budget_amount),
      budgetCurrency: cleanNullable(extracted.budget_currency),
      preferredDate: cleanNullable(extracted.preferred_date),
      preferredDateText: cleanNullable(extracted.preferred_date_text),
      scopeDetails: extracted.scope_details.slice(0, 20),
      urgency: extracted.urgency,
      urgencyReason: extracted.urgency_reason,
      purchaseIntent: extracted.purchase_intent,
      purchaseIntentReason: extracted.purchase_intent_reason,
      serviceFit: extracted.service_fit,
      locationFit: extracted.location_fit,
      knownFacts: extracted.known_facts.slice(0, 20),
      missingInformation: missing,
      recommendedNextAction: extracted.recommended_next_action,
      suggestedQuestions: extracted.suggested_questions.slice(0, 3),
      possibleSpam,
      doNotContact,
      requiresHumanReview: extracted.requires_human_review || possibleSpam || doNotContact || extracted.service_fit === "unsupported",
      confidence: extracted.overall_confidence,
      score,
      temperature: temperatureFor(score.total),
    };
    return { analysis, modelUsed: configured.model };
  } catch (error) {
    console.warn("OpenAI extraction unavailable; using rules fallback", error);
    return { analysis: fallback, modelUsed: "leadpilot-rules-v1" };
  }
}

export async function draftWithOptionalAI(input: LeadInput, analysis: LeadAnalysis, business: BusinessProfile): Promise<ReplyDraft | null> {
  const fallback = draftFirstReply(input, analysis, business);
  if (!fallback || analysis.possibleSpam || analysis.doNotContact) return null;
  const configured = configuration();
  if (!configured) return fallback;
  try {
    const drafted = await callStructured<ReplyDraft>(configured, "leadpilot_first_response", replySchema, FIRST_RESPONSE_PROMPT, JSON.stringify({ business_profile: business, lead: input, verified_analysis: analysis, communication_channel: input.email ? "email" : "phone", desired_tone: business.responseTone }));
    if (!drafted.message.trim() || (drafted.message.match(/\?/g) ?? []).length > 2) return fallback;
    return { ...drafted, message: drafted.message.slice(0, 5000), requestedInformation: drafted.requestedInformation.slice(0, 2) };
  } catch (error) {
    console.warn("OpenAI drafting unavailable; using rules fallback", error);
    return fallback;
  }
}

async function callStructured<T>(configured: { apiKey: string; model: string }, name: string, schema: object, instructions: string, input: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${configured.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: configured.model, store: false, input: [{ role: "system", content: instructions }, { role: "user", content: input }], text: { format: { type: "json_schema", name, strict: true, schema } } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`OpenAI returned ${response.status}`);
      const payload = await response.json() as { status?: string; output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }> };
      if (payload.status && payload.status !== "completed") throw new Error(`OpenAI response status: ${payload.status}`);
      const content = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text" && item.text);
      if (!content?.text) throw new Error(payload.output?.flatMap((item) => item.content ?? []).find((item) => item.refusal)?.refusal || "OpenAI returned no structured text.");
      return JSON.parse(content.text) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function configuration() {
  try {
    const env = getCloudflareEnv();
    const apiKey = env.OPENAI_API_KEY?.trim();
    const model = env.OPENAI_MODEL?.trim() || "gpt-5.6";
    return apiKey ? { apiKey, model } : null;
  } catch {
    return null;
  }
}

function validMessageType(value: string): LeadAnalysis["messageType"] {
  return ["sales_enquiry", "support_request", "job_application", "vendor_message", "spam", "other"].includes(value) ? value as LeadAnalysis["messageType"] : "other";
}

function cleanNullable(value: string | null) { return value?.trim() || null; }
function finiteOrNull(value: number | null) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
