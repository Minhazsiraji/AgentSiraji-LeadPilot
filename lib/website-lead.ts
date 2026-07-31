export type WebsiteLead = {
  customerName: string;
  email: string;
  phone: string;
  service: string;
  location: string;
  expectedValue: number;
  message: string;
  pageUrl: string;
  sourceName: string;
};

export function validateWebsiteLead(payload: Record<string, unknown>) {
  const honeypot = text(first(payload, ["companyWebsite", "website_confirm", "fax"]), 200);
  if (honeypot) return { ok: true as const, ignored: true as const };

  const customerName = text(first(payload, ["customerName", "name", "fullName"]), 120);
  const email = text(first(payload, ["email", "emailAddress"]), 200).toLowerCase();
  const phone = text(first(payload, ["phone", "mobile", "telephone", "tel"]), 40);
  const service = text(first(payload, ["service", "product", "package", "interest"]), 200);
  const location = text(first(payload, ["location", "address", "city", "area"]), 300);
  const message = text(first(payload, ["message", "enquiry", "details", "note", "comments"]), 5000);
  const pageUrl = safeUrl(text(first(payload, ["pageUrl", "page_url", "referrer", "websiteUrl"]), 500));
  const sourceName = text(first(payload, ["sourceName", "source", "formName", "campaign"]), 80) || "Hosted lead form";
  const expectedValue = number(first(payload, ["expectedValue", "value", "budget", "amount"]));

  if (customerName.length < 2 || !/[\p{L}\p{N}]/u.test(customerName)) {
    return failure("Enter the customer's name.");
  }
  if (!email && !phone) return failure("Enter an email address or phone number.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return failure("Enter a valid email address.");
  if (phone && phone.replace(/\D/g, "").length < 7) return failure("Enter a valid phone number.");
  if (!service && message.length < 5) return failure("Describe what the customer is interested in.");

  return {
    ok: true as const,
    ignored: false as const,
    lead: {
      customerName,
      email,
      phone,
      service,
      location,
      expectedValue,
      message,
      pageUrl,
      sourceName,
    } satisfies WebsiteLead,
  };
}

export function websiteLeadMessage(lead: WebsiteLead) {
  return [
    lead.service ? `Interested in: ${lead.service}.` : "",
    lead.location ? `Location: ${lead.location}.` : "",
    lead.expectedValue > 0 ? `Customer-provided value or budget: ${lead.expectedValue}.` : "",
    lead.message,
    lead.pageUrl ? `Submitted from: ${lead.pageUrl}.` : "",
  ].filter(Boolean).join(" ");
}

export function websiteLeadSource(sourceName: string) {
  return `Website · ${text(sourceName, 80) || "Lead form"}`;
}

export function verifyWebsiteIngestKey(supplied: string | null | undefined, configured: string | null | undefined) {
  const left = supplied?.trim() ?? "";
  const right = configured?.trim() ?? "";
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function allowedWebsiteOrigin(origin: string | null, configuredOrigins: string | null | undefined) {
  if (!origin) return true;
  const allowed = (configuredOrigins ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return allowed.includes("*") || allowed.includes(origin.replace(/\/$/, ""));
}

export function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, "").trim();
  return request.headers.get("x-leadpilot-key")?.trim() ?? "";
}

function first(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(typeof value === "string" ? value.replace(/[^\d.-]/g, "") : NaN);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1_000_000_000) : 0;
}

function safeUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().slice(0, 500) : "";
  } catch {
    return "";
  }
}

function failure(error: string) {
  return { ok: false as const, error };
}
