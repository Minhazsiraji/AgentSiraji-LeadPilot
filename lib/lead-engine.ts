import type { BusinessProfile, LeadAnalysis, LeadInput, Level, ReplyDraft, ScoreBreakdown, Temperature } from "./types";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SPAM_PATTERNS = [/\bcrypto\b/i, /\bseo package\b/i, /\bguest post\b/i, /\bcasino\b/i, /\bbacklinks?\b/i];
const STOP_PATTERNS = [/\bstop (?:contacting|messaging|emailing) me\b/i, /\bdo not contact\b/i, /\bdon't contact\b/i, /\bunsubscribe\b/i];

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function normalizePhone(value?: string | null) {
  const normalized = value?.replace(/[^\d+]/g, "") || "";
  return normalized || null;
}

export function normalizeMessage(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "");
}

export function analyzeLead(input: LeadInput, business: BusinessProfile): LeadAnalysis {
  const message = input.message.trim();
  const lower = message.toLowerCase();
  const possibleSpam = SPAM_PATTERNS.some((pattern) => pattern.test(message));
  const doNotContact = STOP_PATTERNS.some((pattern) => pattern.test(message));
  const serviceRequested = findService(lower, business.services);
  const explicitlyExcluded = findService(lower, business.excludedServices);
  const hasUnrelatedRepair = /\b(repair|fix)\b.*\b(washing machine|appliance|boiler|car|phone)\b/i.test(message);
  const location = findLocation(message, business.serviceAreas);
  const hasLocationClue = Boolean(location || /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(message));
  const budget = findBudget(message, business.currency);
  const preferredDate = findPreferredDate(message, input.submittedAt);
  const scopeDetails = findScopeDetails(message);
  const urgency = classifyUrgency(lower, preferredDate?.isoDate ?? null, input.submittedAt);
  const purchaseIntent = classifyPurchaseIntent(lower, serviceRequested, scopeDetails.length);
  const serviceFit = explicitlyExcluded || hasUnrelatedRepair ? "unsupported" : serviceRequested ? "supported" : "unknown";
  const locationFit = location ? "supported" : hasLocationClue ? "unknown" : "unknown";
  const messageType = possibleSpam ? "spam" : doNotContact ? "other" : "sales_enquiry";

  const missingInformation: string[] = [];
  if (!serviceRequested) missingInformation.push("service requested");
  if (!location) missingInformation.push("service location");
  if (!preferredDate) missingInformation.push("preferred date");
  if (!budget.amount && scopeDetails.length === 0) missingInformation.push("budget or scope");
  if (!input.email && !input.phone) missingInformation.push("contact information");

  const knownFacts = [
    serviceRequested ? `Service: ${serviceRequested}` : null,
    location ? `Location: ${location}` : null,
    preferredDate ? `Preferred date: ${preferredDate.originalText}` : null,
    budget.amount ? `Budget: ${budget.currency} ${budget.amount}` : null,
    ...scopeDetails,
  ].filter((value): value is string => Boolean(value));

  const score = calculateScore({
    serviceFit,
    purchaseIntent,
    urgency,
    knownQualificationCount: 5 - missingInformation.length,
    hasClearAction: /\?|\b(price|quote|book|availability|call|send|need|want)\b/i.test(message),
  });
  const temperature = temperatureFor(score.total);
  const requiresHumanReview = possibleSpam || serviceFit === "unsupported" || doNotContact;
  const suggestedQuestions = buildQuestions(missingInformation).slice(0, 3);
  const recommendedNextAction = doNotContact
    ? "Stop all communication and cancel pending follow-ups."
    : possibleSpam
      ? "Review as possible spam; do not create a reply."
      : serviceFit === "unsupported"
        ? "Review the request before responding; the requested service may not be offered."
        : suggestedQuestions.length
          ? `Ask for ${missingInformation.slice(0, 2).join(" and ")}.`
          : "Review and approve the prepared response."

  return {
    language: "en",
    messageType,
    serviceRequested,
    location,
    budgetAmount: budget.amount,
    budgetCurrency: budget.currency,
    preferredDate: preferredDate?.isoDate ?? null,
    preferredDateText: preferredDate?.originalText ?? null,
    scopeDetails,
    urgency: urgency.level,
    urgencyReason: urgency.reason,
    purchaseIntent: purchaseIntent.level,
    purchaseIntentReason: purchaseIntent.reason,
    serviceFit,
    locationFit,
    knownFacts,
    missingInformation,
    recommendedNextAction,
    suggestedQuestions,
    possibleSpam,
    doNotContact,
    requiresHumanReview,
    confidence: knownFacts.length >= 3 ? "high" : knownFacts.length ? "medium" : "low",
    score,
    temperature,
  };
}

export function draftFirstReply(input: LeadInput, analysis: LeadAnalysis, business: BusinessProfile): ReplyDraft | null {
  if (analysis.possibleSpam || analysis.doNotContact) return null;

  const greeting = input.customerName.trim() ? `Hi ${input.customerName.trim().split(/\s+/)[0]},` : "Hello,";
  const servicePhrase = analysis.serviceRequested
    ? `your ${analysis.serviceRequested.toLowerCase()} enquiry`
    : "your cleaning enquiry";
  const detailParts = [
    analysis.location ? `in ${analysis.location}` : null,
    analysis.preferredDateText ? `for ${analysis.preferredDateText}` : null,
  ].filter(Boolean);
  const acknowledgement = `Thank you for getting in touch about ${servicePhrase}${detailParts.length ? ` ${detailParts.join(" ")}` : ""}.`;
  const questions = analysis.suggestedQuestions.slice(0, 2);
  const questionCopy = questions.length ? ` ${questions.join(" ")}` : "";
  const close = questions.length
    ? "Once we have those details, we can confirm the most useful next step."
    : "We have the key details and will confirm the next step with you shortly.";

  return {
    subject: `Your enquiry with ${business.name}`,
    message: `${greeting}\n\n${acknowledgement}${questionCopy}\n\n${close}\n\nBest,\n${business.name}`,
    requestedInformation: analysis.missingInformation.slice(0, 2),
    proposedNextAction: analysis.recommendedNextAction,
    requiresHumanReview: analysis.requiresHumanReview,
    reviewReason: analysis.requiresHumanReview ? "Service or location requires owner review." : null,
  };
}

export function draftFollowUpReply(input: LeadInput, analysis: LeadAnalysis, business: BusinessProfile, step: number): ReplyDraft | null {
  if (analysis.possibleSpam || analysis.doNotContact) return null;
  const firstName = input.customerName.trim().split(/\s+/)[0] || "there";
  const request = analysis.serviceRequested?.toLowerCase() || "cleaning";
  const question = analysis.suggestedQuestions[0];
  const isFinal = step >= 3;
  const message = isFinal
    ? `Hi ${firstName},\n\nThis is our final follow-up about your ${request} enquiry. If you still need help, simply reply when the timing is right and we’ll be happy to continue.\n\nBest,\n${business.name}`
    : step === 2
      ? `Hi ${firstName},\n\nJust checking whether you would still like help with your ${request} enquiry.${question ? ` ${question}` : " Reply when convenient and we can confirm the next step."}\n\nBest,\n${business.name}`
      : `Hi ${firstName},\n\nA quick follow-up on your ${request} enquiry.${question ? ` ${question}` : " Let us know if you would like us to continue with the next step."}\n\nBest,\n${business.name}`;
  return {
    subject: `Following up on your enquiry with ${business.name}`,
    message,
    requestedInformation: question ? [question] : [],
    proposedNextAction: isFinal ? "Close the active follow-up sequence after owner approval." : "Wait for the customer to reply.",
    requiresHumanReview: false,
    reviewReason: null,
  };
}

export function calculateScore(input: {
  serviceFit: "supported" | "unsupported" | "unknown";
  purchaseIntent: { level: Level };
  urgency: { level: Level };
  knownQualificationCount: number;
  hasClearAction: boolean;
}): ScoreBreakdown {
  const serviceFit = input.serviceFit === "supported" ? 30 : input.serviceFit === "unknown" ? 15 : 0;
  const purchaseIntent = input.purchaseIntent.level === "high" ? 25 : input.purchaseIntent.level === "medium" ? 15 : 5;
  const urgency = input.urgency.level === "high" ? 20 : input.urgency.level === "medium" ? 12 : 5;
  const completeness = Math.max(0, Math.min(5, input.knownQualificationCount)) * 3;
  const engagement = input.hasClearAction ? 10 : 5;
  return { serviceFit, purchaseIntent, urgency, completeness, engagement, total: serviceFit + purchaseIntent + urgency + completeness + engagement };
}

export function temperatureFor(score: number): Temperature {
  if (score >= 70) return "Hot";
  if (score >= 40) return "Warm";
  return "Cold";
}

function findService(message: string, services: string[]) {
  return services.find((service) => {
    const terms = service.toLowerCase().replace(/cleaning/g, "clean").split(/[^a-z0-9]+/).filter((term) => term.length > 2);
    return terms.every((term) => message.includes(term)) || terms.some((term) => message.includes(term) && term !== "clean");
  }) ?? null;
}

function findLocation(message: string, areas: string[]) {
  return areas.find((area) => message.toLowerCase().includes(area.toLowerCase())) ?? null;
}

function findBudget(message: string, defaultCurrency: string) {
  const match = message.match(/(?:£|\$|€|gbp\s*|usd\s*|eur\s*)(\d+(?:[.,]\d{1,2})?)/i);
  if (!match) return { amount: null, currency: null };
  const amount = Number(match[1].replace(",", "."));
  const token = match[0].toLowerCase();
  const currency = token.includes("$") || token.includes("usd") ? "USD" : token.includes("€") || token.includes("eur") ? "EUR" : token.includes("£") || token.includes("gbp") ? "GBP" : defaultCurrency;
  return { amount: Number.isFinite(amount) ? amount : null, currency };
}

function findScopeDetails(message: string) {
  const details: string[] = [];
  const bedroom = message.match(/\b(\d+|one|two|three|four|five)[ -]bed(?:room)?s?\b/i);
  const property = message.match(/\b(apartment|flat|house|office|studio|shop)\b/i);
  const frequency = message.match(/\b(weekly|fortnightly|monthly|one[- ]off)\b/i);
  if (bedroom) details.push(`Property size: ${bedroom[0]}`);
  if (property) details.push(`Property type: ${property[0]}`);
  if (frequency) details.push(`Frequency: ${frequency[0]}`);
  return details;
}

function findPreferredDate(message: string, submittedAt: string) {
  const lower = message.toLowerCase();
  const base = new Date(submittedAt);
  if (Number.isNaN(base.getTime())) return null;
  if (/\btoday\b/.test(lower)) return { isoDate: toIsoDate(base), originalText: "today" };
  if (/\btomorrow\b/.test(lower)) return { isoDate: toIsoDate(addDays(base, 1)), originalText: "tomorrow" };
  const dayMatch = lower.match(/\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (dayMatch) {
    const target = DAY_NAMES.indexOf(dayMatch[2]);
    let offset = (target - base.getUTCDay() + 7) % 7;
    if (offset === 0) offset = 7;
    if (dayMatch[1] && offset < 7) offset += 7;
    return { isoDate: toIsoDate(addDays(base, offset)), originalText: dayMatch[0] };
  }
  const isoMatch = message.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return { isoDate: isoMatch[0], originalText: isoMatch[0] };
  return null;
}

function classifyUrgency(message: string, preferredDate: string | null, submittedAt: string) {
  if (/\b(asap|urgent|today|tomorrow|immediately|this weekend)\b/.test(message)) return { level: "high" as const, reason: "Customer requested a near-term service." };
  if (preferredDate) {
    const days = Math.ceil((new Date(preferredDate).getTime() - new Date(submittedAt).getTime()) / 86_400_000);
    return days <= 7 ? { level: "high" as const, reason: "Preferred date is within one week." } : { level: "medium" as const, reason: "Customer provided a future date." };
  }
  return { level: "low" as const, reason: "No deadline was provided." };
}

function classifyPurchaseIntent(message: string, service: string | null, scopeCount: number) {
  if (/\b(price|quote|book|booking|availability|available|how much|send.*price)\b/.test(message) && (service || scopeCount)) return { level: "high" as const, reason: "Customer requested a transaction-related next step and supplied useful detail." };
  if (service || /\b(need|want|looking for|interested)\b/.test(message)) return { level: "medium" as const, reason: "Customer expressed relevant interest." };
  return { level: "low" as const, reason: "The enquiry is exploratory or unclear." };
}

function buildQuestions(missing: string[]) {
  return missing.map((field) => {
    if (field === "service requested") return "Which cleaning service would you like help with?";
    if (field === "service location") return "What is the service address or postcode?";
    if (field === "preferred date") return "When would you like the cleaning completed?";
    if (field === "budget or scope") return "Could you share the property size or cleaning scope?";
    return "What is the best way to contact you?";
  });
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
