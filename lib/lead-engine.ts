import type { BusinessProfile, LeadAnalysis, LeadInput, Level, ReplyDraft, ScoreBreakdown, Temperature } from "./types";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SPAM_PATTERNS = [/\bcrypto\b/i, /\bseo package\b/i, /\bguest post\b/i, /\bcasino\b/i, /\bbacklinks?\b/i];
const STOP_PATTERNS = [/\bstop (?:contacting|messaging|emailing) me\b/i, /\bdo not contact\b/i, /\bdon't contact\b/i, /\bunsubscribe\b/i];

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export function normalizePhone(value?: string | null) {
  const digits = value?.replace(/\D/g, "") || "";
  if (/^01[3-9]\d{8}$/.test(digits)) return `+880${digits.slice(1)}`;
  if (/^8801[3-9]\d{8}$/.test(digits)) return `+${digits}`;
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
  const configuredOrder = inferConfiguredOrder(message, business.services);
  const serviceRequested = configuredOrder?.serviceRequested ?? findService(lower, business.services);
  const explicitlyExcluded = findService(lower, business.excludedServices);
  const hasUnrelatedRepair = /\b(repair|fix)\b.*\b(washing machine|appliance|boiler|car|phone)\b/i.test(message);
  const deliveryLocation = extractDeliveryLocation(message);
  const location = deliveryLocation ?? findLocation(message, business.serviceAreas);
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
  if (!location) missingInformation.push(configuredOrder ? "delivery address" : "service location");
  if (configuredOrder) {
    if (!input.email && !input.phone) missingInformation.push("contact information");
    if (!/\b(?:cash on delivery|cod)\b/i.test(message)) missingInformation.push("cash on delivery confirmation");
  } else {
    if (!preferredDate) missingInformation.push("preferred date");
    if (!budget.amount && scopeDetails.length === 0) missingInformation.push("budget or scope");
    if (!input.email && !input.phone) missingInformation.push("contact information");
  }

  const knownFacts = [
    serviceRequested ? `Service: ${serviceRequested}` : null,
    location ? `Location: ${location}` : null,
    preferredDate ? `Preferred date: ${preferredDate.originalText}` : null,
    budget.amount ? `Budget: ${budget.currency} ${budget.amount}` : null,
    input.phone ? `Phone: ${input.phone}` : null,
    deliveryLocation ? `Delivery address: ${deliveryLocation}` : null,
    ...scopeDetails,
  ].filter((value): value is string => Boolean(value));

  const score = calculateScore({
    serviceFit,
    purchaseIntent,
    urgency,
    knownQualificationCount: 5 - missingInformation.length,
    hasClearAction: /\?|\b(price|quote|book|order|buy|availability|call|send|need|want|koto|chai)\b/i.test(message),
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
    : `your ${business.enquiryLabel.toLowerCase()}`;
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
  const request = analysis.serviceRequested?.toLowerCase() || business.enquiryLabel.toLowerCase();
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

export function inferConfiguredOrder(message: string, services: string[]) {
  const requested = message.match(/\b(\d+|one|two|three|four|five)\s*(bottles?|packs?|pieces?|pcs)\b/i);
  if (!requested) return null;

  const quantity = Number(normalizeQuantity(requested[1]));
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000) return null;

  const requestedUnit = normalizeUnit(requested[2]);
  const packages = services.flatMap((service) => {
    const match = service.match(/\b(\d+|one|two|three|four|five)\s*(bottles?|packs?|pieces?|pcs)\b.*?([৳£$€])\s*(\d+(?:\.\d+)?)/i);
    if (!match || normalizeUnit(match[2]) !== requestedUnit) return [];
    const packageQuantity = Number(normalizeQuantity(match[1]));
    const price = Number(match[4]);
    return Number.isInteger(packageQuantity) && packageQuantity > 0 && Number.isFinite(price)
      ? [{ quantity: packageQuantity, price, symbol: match[3] }]
      : [];
  });
  if (!packages.length) return null;

  const best = Array<number>(quantity + 1).fill(Number.POSITIVE_INFINITY);
  best[0] = 0;
  for (let current = 1; current <= quantity; current += 1) {
    for (const item of packages) {
      if (item.quantity <= current) {
        best[current] = Math.min(best[current], best[current - item.quantity] + item.price);
      }
    }
  }
  if (!Number.isFinite(best[quantity])) return null;

  const symbol = packages[0].symbol;
  const unit = quantity === 1 ? singularUnit(requestedUnit) : pluralUnit(requestedUnit);
  return {
    quantity,
    serviceRequested: `${quantity} ${unit} — ${symbol}${formatPrice(best[quantity])}`,
    expectedValue: best[quantity],
  };
}

export function ensureOrderPackages(services: string[], fallbackPackages: string[]) {
  const hasConfiguredPackage = services.some((service) =>
    /\b(?:\d+|one|two)\s*(?:bottles?|packs?|pieces?|pcs)\b.*?[৳£$€]\s*\d+/i.test(service),
  );
  return hasConfiguredPackage
    ? services
    : [...fallbackPackages, ...services];
}

export function extractMessagePhone(message: string) {
  const labelled = message.match(
    /\b(?:phone|mobile|contact|whatsapp)(?:\s+(?:number|no\.?))?\s*[:=-]?\s*(\+?8801[3-9]\d{8}|01[3-9]\d{8})\b/i,
  )?.[1];
  const general = message.match(/(?:^|[^\d])(\+?8801[3-9]\d{8}|01[3-9]\d{8})(?!\d)/)?.[1];
  return normalizePhone(labelled ?? general ?? null);
}

export function extractCustomerName(message: string) {
  return extractLabeledValue(message, ["customer name", "name", "নাম"])
    ?.slice(0, 120) ?? null;
}

export function extractDeliveryLocation(message: string) {
  const address = extractLabeledValue(message, [
    "delivery address",
    "delivery location",
    "full address",
    "address",
    "ডেলিভারি ঠিকানা",
    "ঠিকানা",
  ]);
  if (address) return cleanDeliveryLocation(address);

  const thana = extractLabeledValue(message, ["thana/upazila", "thana", "upazila", "থানা/উপজেলা", "থানা", "উপজেলা"]);
  const district = extractLabeledValue(message, ["district", "জেলা"]);
  const structuredLocation = [thana, district].filter(Boolean).join(", ");
  if (structuredLocation) return structuredLocation;

  return extractAddressAfterPhone(message);
}

function cleanDeliveryLocation(value: string) {
  const orderDetailStart = value.search(
    /\s+(?=(?:\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b|(?:cash\s+on\s+delivery|cod)\b|ক্যাশ\s+অন\s+ডেলিভারি)/iu,
  );
  const location = (orderDetailStart >= 0 ? value.slice(0, orderDetailStart) : value)
    .replace(/[\s,;:=-]+$/, "")
    .trim();
  return location || null;
}

function extractAddressAfterPhone(message: string) {
  const phone = message.match(/(?:^|[^\d])(?:\+?8801[3-9]\d{8}|01[3-9]\d{8})(?!\d)/);
  if (!phone || phone.index === undefined) return null;

  const afterPhone = message
    .slice(phone.index + phone[0].length)
    .split(/[\r\n.!?।]/, 1)[0]
    ?.replace(/^[\s,;:=-]+/, "")
    .trim();
  if (!afterPhone || !afterPhone.includes(",")) return null;

  const candidate = afterPhone
    .split(/\b(?:payment|pay|cod|cash on delivery|note)\b|(?:পেমেন্ট|ক্যাশ অন ডেলিভারি|নোট)/iu, 1)[0]
    ?.replace(/[\s,;:=-]+$/, "")
    .trim();
  if (!candidate || candidate.length < 3 || candidate.length > 300) return null;
  if (!/[\p{L}]/u.test(candidate)) return null;
  if (/\b(?:bottles?|packs?|pieces?|pcs|order|price|parcel|delivery status)\b/iu.test(candidate)) return null;

  const parts = candidate.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4 || parts.some((part) => !/[\p{L}]/u.test(part))) return null;
  return parts.join(", ");
}

function findService(message: string, services: string[]) {
  const messageQuantity = message.match(/\b(\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i)?.[1];
  const ranked = services.map((service) => {
    const normalized = service.toLowerCase().replace(/[৳£$€]\s*\d+(?:\.\d+)?/g, "");
    const terms = normalized.split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 1);
    const offeringQuantity = normalized.match(/\b(\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i)?.[1];
    const quantityScore = messageQuantity && offeringQuantity
      ? normalizeQuantity(messageQuantity) === normalizeQuantity(offeringQuantity) ? 100 : -100
      : 0;
    const termScore = terms.filter((term) => message.includes(term)).length;
    return { service, score: quantityScore + termScore };
  }).filter((candidate) => candidate.score > 0).sort((left, right) => right.score - left.score);
  return ranked[0]?.service ?? null;
}

function normalizeQuantity(value: string) {
  const words: Record<string, string> = { one: "1", two: "2", three: "3", four: "4", five: "5" };
  return words[value.toLowerCase()] ?? value;
}

function normalizeUnit(value: string) {
  const lower = value.toLowerCase();
  if (lower === "pcs") return "piece";
  return lower.endsWith("s") ? lower.slice(0, -1) : lower;
}

function singularUnit(value: string) {
  return value === "piece" ? "piece" : value;
}

function pluralUnit(value: string) {
  return value === "piece" ? "pieces" : `${value}s`;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function findLocation(message: string, areas: string[]) {
  return areas.find((area) => message.toLowerCase().includes(area.toLowerCase())) ?? null;
}

function findBudget(message: string, defaultCurrency: string) {
  const match = message.match(/(?:৳|tk\.?\s*|taka\s*|bdt\s*|£|\$|€|gbp\s*|usd\s*|eur\s*)(\d+(?:[.,]\d{1,2})?)/i);
  if (!match) return { amount: null, currency: null };
  const amount = Number(match[1].replace(",", "."));
  const token = match[0].toLowerCase();
  const currency = token.includes("$") || token.includes("usd") ? "USD" : token.includes("€") || token.includes("eur") ? "EUR" : token.includes("£") || token.includes("gbp") ? "GBP" : /৳|tk|taka|bdt/.test(token) ? "BDT" : defaultCurrency;
  return { amount: Number.isFinite(amount) ? amount : null, currency };
}

function findScopeDetails(message: string) {
  const details: string[] = [];
  const bedroom = message.match(/\b(\d+|one|two|three|four|five)[ -]bed(?:room)?s?\b/i);
  const property = message.match(/\b(apartment|flat|house|office|studio|shop)\b/i);
  const frequency = message.match(/\b(weekly|fortnightly|monthly|one[- ]off)\b/i);
  const quantity = message.match(/\b(\d+|one|two|three|four|five)\s*(?:bottles?|packs?|pieces?|pcs)\b/i);
  const cod = message.match(/\b(?:cash on delivery|cod)\b/i);
  const phone = extractMessagePhone(message);
  const deliveryAddress = extractDeliveryLocation(message);
  if (bedroom) details.push(`Property size: ${bedroom[0]}`);
  if (property) details.push(`Property type: ${property[0]}`);
  if (frequency) details.push(`Frequency: ${frequency[0]}`);
  if (quantity) details.push(`Quantity: ${quantity[0]}`);
  if (phone) details.push(`Phone: ${phone}`);
  if (deliveryAddress) details.push(`Delivery address: ${deliveryAddress}`);
  if (cod) details.push("Payment: Cash on delivery");
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
  if (/\b(price|quote|book|booking|order|buy|availability|available|how much|send.*price|koto|chai)\b/.test(message) && (service || scopeCount)) return { level: "high" as const, reason: "Customer requested a transaction-related next step and supplied useful detail." };
  if (service || /\b(need|want|looking for|interested|nibo)\b/.test(message)) return { level: "medium" as const, reason: "Customer expressed relevant interest." };
  return { level: "low" as const, reason: "The enquiry is exploratory or unclear." };
}

function buildQuestions(missing: string[]) {
  return missing.map((field) => {
    if (field === "service requested") return "Which product, package, or service would you like?";
    if (field === "service location") return "What is your delivery or service location?";
    if (field === "preferred date") return "When do you need it?";
    if (field === "budget or scope") return "Could you share the quantity or scope you need?";
    if (field === "delivery address") return "What is your complete delivery address?";
    if (field === "cash on delivery confirmation") return "Please confirm that cash on delivery is suitable.";
    return "What is the best way to contact you?";
  });
}

function extractLabeledValue(message: string, labels: string[]) {
  const knownLabels = [
    "name",
    "customer name",
    "phone",
    "mobile",
    "contact",
    "whatsapp",
    "district",
    "thana/upazila",
    "thana",
    "upazila",
    "delivery address",
    "delivery location",
    "full address",
    "address",
    "payment",
    "note",
    "নাম",
    "ফোন",
    "মোবাইল",
    "জেলা",
    "থানা/উপজেলা",
    "থানা",
    "উপজেলা",
    "ডেলিভারি ঠিকানা",
    "ঠিকানা",
    "পেমেন্ট",
    "নোট",
  ].map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = message.match(new RegExp(
      `(?:^|\\s+|[.!?।]\\s*)${escaped}\\s*[:=-]\\s*(.+?)(?=(?:\\s+|[.!?।]\\s*)(?:${knownLabels})\\s*[:=-]|$)`,
      "iu",
    ));
    const value = match?.[1]?.trim().replace(/[.!?।]+$/, "").trim();
    if (value) return value.slice(0, 300);
  }
  return null;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
