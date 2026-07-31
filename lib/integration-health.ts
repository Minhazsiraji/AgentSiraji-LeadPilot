import { ensureBusiness, ensureSchema } from "./data";
import { getCloudflareEnv, type LeadPilotEnv } from "./runtime-env";

export type IntegrationState = "ready" | "needs_configuration" | "unavailable";

export type IntegrationCheck = {
  id: string;
  label: string;
  state: IntegrationState;
  summary: string;
  endpoint?: string;
  lastActivityAt?: string | null;
  configured?: Record<string, boolean>;
  notes?: string[];
};

export type IntegrationHealthPayload = {
  checkedAt: string;
  overall: IntegrationState;
  readyCount: number;
  needsConfigurationCount: number;
  unavailableCount: number;
  checks: IntegrationCheck[];
  safety: {
    secretsReturned: false;
    externalMessagesSent: false;
    customerRecordsCreated: false;
  };
};

export type SmokeTestCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type SmokeTestPayload = {
  checkedAt: string;
  passed: number;
  failed: number;
  checks: SmokeTestCheck[];
  manualChecks: Array<{ id: string; label: string; path?: string; testMessage?: string }>;
  safety: {
    externalMessagesSent: false;
    customerRecordsCreated: false;
    secretsReturned: false;
  };
};

type LatestRow = { created_at?: string; received_at?: string; status?: string };

export function configurationFlags(env: LeadPilotEnv) {
  return {
    facebook: {
      verifyToken: present(env.FACEBOOK_VERIFY_TOKEN),
      appSecret: present(env.FACEBOOK_APP_SECRET),
      pageAccessToken: present(env.FACEBOOK_PAGE_ACCESS_TOKEN),
      pageId: present(env.FACEBOOK_PAGE_ID),
    },
    website: {
      ingestKey: present(env.WEBSITE_INGEST_KEY),
      allowedOrigins: configuredOriginCount(env.WEBSITE_ALLOWED_ORIGINS) > 0,
    },
    whatsapp: {
      verifyToken: present(env.WHATSAPP_VERIFY_TOKEN),
      accessToken: present(env.WHATSAPP_ACCESS_TOKEN),
      phoneNumberId: present(env.WHATSAPP_PHONE_NUMBER_ID),
      businessAccountId: present(env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    },
    ai: {
      provider: selectedAiProvider(env),
      geminiKey: present(env.GEMINI_API_KEY),
      openAiKey: present(env.OPENAI_API_KEY),
    },
  };
}

export function selectedAiProvider(env: LeadPilotEnv): "gemini" | "openai" | "rules" {
  const selected = env.AI_PROVIDER?.trim().toLowerCase();
  if (selected === "gemini" && present(env.GEMINI_API_KEY)) return "gemini";
  if (selected === "openai" && present(env.OPENAI_API_KEY)) return "openai";
  if (!selected && present(env.GEMINI_API_KEY)) return "gemini";
  if (!selected && present(env.OPENAI_API_KEY)) return "openai";
  return "rules";
}

export function overallIntegrationState(checks: IntegrationCheck[]): IntegrationState {
  const database = checks.find((check) => check.id === "database");
  if (!database || database.state === "unavailable") return "unavailable";
  return checks.some((check) => check.state === "needs_configuration" || check.state === "unavailable")
    ? "needs_configuration"
    : "ready";
}

export async function getIntegrationHealth(): Promise<IntegrationHealthPayload> {
  const env = getCloudflareEnv();
  const flags = configurationFlags(env);
  const checkedAt = new Date().toISOString();
  const checks: IntegrationCheck[] = [];

  let databaseReady = false;
  let businessName = "Configured business";
  try {
    await ensureSchema();
    const business = await ensureBusiness();
    businessName = business.name;
    const probe = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    databaseReady = probe?.ok === 1;
    checks.push({
      id: "database",
      label: "D1 database",
      state: databaseReady ? "ready" : "unavailable",
      summary: databaseReady ? `Available for ${businessName}` : "The database probe did not return a valid result.",
      notes: ["This check reads configuration and schema only; it does not create a lead."],
    });
  } catch {
    checks.push({
      id: "database",
      label: "D1 database",
      state: "unavailable",
      summary: "LeadPilot could not access the D1 database.",
    });
  }

  const latestFacebook = databaseReady
    ? await safeFirst(env, "SELECT received_at, status FROM facebook_webhook_events ORDER BY received_at DESC LIMIT 1")
    : null;
  const facebookConfigured = Object.values(flags.facebook).every(Boolean);
  checks.push({
    id: "facebook",
    label: "Facebook Messenger",
    state: facebookConfigured ? "ready" : "needs_configuration",
    summary: facebookConfigured
      ? latestFacebook?.received_at
        ? `Configured; latest stored webhook event is ${latestFacebook.status || "recorded"}.`
        : "Configured; no stored webhook event was found yet."
      : "One or more required Messenger runtime values are missing.",
    endpoint: "/api/webhooks/facebook",
    lastActivityAt: latestFacebook?.received_at ?? null,
    configured: flags.facebook,
    notes: ["The health check never calls Meta and never exposes token values."],
  });

  const latestLanding = databaseReady
    ? await safeFirst(env, "SELECT created_at FROM leads WHERE source = 'StepFresh landing page' ORDER BY created_at DESC LIMIT 1")
    : null;
  checks.push({
    id: "stepfresh-landing",
    label: "StepFresh landing page",
    state: databaseReady ? "ready" : "unavailable",
    summary: databaseReady
      ? latestLanding?.created_at
        ? "The order form is connected and a stored landing-page order was found."
        : "The order form route is ready; submit one order after deployment to verify live intake."
      : "The order form cannot save leads while D1 is unavailable.",
    endpoint: "/enquire",
    lastActivityAt: latestLanding?.created_at ?? null,
  });

  const latestWebsite = databaseReady
    ? await safeFirst(env, "SELECT created_at FROM leads WHERE source LIKE 'Website · %' ORDER BY created_at DESC LIMIT 1")
    : null;
  checks.push({
    id: "hosted-form",
    label: "Hosted client lead form",
    state: databaseReady ? "ready" : "unavailable",
    summary: databaseReady
      ? latestWebsite?.created_at
        ? "The reusable form is connected and a stored website lead was found."
        : "The reusable form is ready; submit a test lead after deployment."
      : "The hosted form cannot save leads while D1 is unavailable.",
    endpoint: "/lead-form?source=Client%20Website",
    lastActivityAt: latestWebsite?.created_at ?? null,
  });

  const originCount = configuredOriginCount(env.WEBSITE_ALLOWED_ORIGINS);
  checks.push({
    id: "website-api",
    label: "Secure website connector",
    state: flags.website.ingestKey ? "ready" : "needs_configuration",
    summary: flags.website.ingestKey
      ? `Server-side integration key is configured${originCount ? ` with ${originCount} allowed origin${originCount === 1 ? "" : "s"}` : "; server-to-server requests remain available"}.`
      : "Add WEBSITE_INGEST_KEY before connecting an existing client form.",
    endpoint: "/api/integrations/website-leads",
    configured: flags.website,
    notes: ["The integration key is never returned to the browser."],
  });

  const latestWhatsApp = databaseReady
    ? await safeFirst(env, "SELECT created_at FROM leads WHERE lower(source) LIKE '%whatsapp%' ORDER BY created_at DESC LIMIT 1")
    : null;
  const whatsappCloudConfigured = flags.whatsapp.verifyToken
    && flags.whatsapp.accessToken
    && flags.whatsapp.phoneNumberId;
  checks.push({
    id: "whatsapp",
    label: "WhatsApp",
    state: whatsappCloudConfigured || Boolean(latestWhatsApp?.created_at) ? "ready" : "needs_configuration",
    summary: latestWhatsApp?.created_at
      ? "A stored WhatsApp-sourced lead was found."
      : whatsappCloudConfigured
        ? "WhatsApp Cloud API runtime values are present; complete a live message test after deployment."
        : "Manual WhatsApp send links remain available, but Cloud API runtime values were not detected.",
    lastActivityAt: latestWhatsApp?.created_at ?? null,
    configured: flags.whatsapp,
    notes: ["This check does not send a WhatsApp message and does not claim webhook delivery succeeded."],
  });

  const provider = flags.ai.provider;
  checks.push({
    id: "ai",
    label: "Lead analysis engine",
    state: "ready",
    summary: provider === "rules"
      ? "Deterministic rules fallback is active; no paid AI key is required."
      : `${provider === "gemini" ? "Gemini" : "OpenAI"} is selected with a server-side key.`,
    configured: {
      gemini: flags.ai.geminiKey,
      openai: flags.ai.openAiKey,
      rulesFallback: true,
    },
    notes: ["No test prompt is sent to an AI provider by this health check."],
  });

  const overall = overallIntegrationState(checks);
  return {
    checkedAt,
    overall,
    readyCount: checks.filter((check) => check.state === "ready").length,
    needsConfigurationCount: checks.filter((check) => check.state === "needs_configuration").length,
    unavailableCount: checks.filter((check) => check.state === "unavailable").length,
    checks,
    safety: {
      secretsReturned: false,
      externalMessagesSent: false,
      customerRecordsCreated: false,
    },
  };
}

export async function runSafeSmokeTest(): Promise<SmokeTestPayload> {
  const health = await getIntegrationHealth();
  const byId = new Map(health.checks.map((check) => [check.id, check]));
  const checks: SmokeTestCheck[] = [
    result("database", "D1 database and schema", byId.get("database")?.state === "ready", byId.get("database")?.summary),
    result("business", "Business profile loads", byId.get("database")?.state === "ready", "The configured business profile was loaded during the database check."),
    result("landing", "StepFresh order route is ready", byId.get("stepfresh-landing")?.state === "ready", byId.get("stepfresh-landing")?.summary),
    result("hosted-form", "Reusable client form is ready", byId.get("hosted-form")?.state === "ready", byId.get("hosted-form")?.summary),
    result("facebook", "Messenger configuration is complete", byId.get("facebook")?.state === "ready", byId.get("facebook")?.summary),
    result("website-security", "Custom website API is protected", byId.get("website-api")?.state === "ready", byId.get("website-api")?.summary),
    result("ai-fallback", "A lead-analysis engine is available", byId.get("ai")?.state === "ready", byId.get("ai")?.summary),
  ];

  return {
    checkedAt: new Date().toISOString(),
    passed: checks.filter((check) => check.passed).length,
    failed: checks.filter((check) => !check.passed).length,
    checks,
    manualChecks: [
      { id: "landing-live", label: "Submit a fresh StepFresh order and confirm a separate lead and owner notification.", path: "/enquire" },
      { id: "website-live", label: "Submit a client-form enquiry and confirm source Website · Deployment smoke test.", path: "/lead-form?source=Deployment%20smoke%20test" },
      {
        id: "messenger-repeat",
        label: "From a Messenger customer with a completed order, send a genuine new order and confirm a new lead is created.",
        testMessage: "I want to order 2 bottles of StepFresh. Name: Deployment Test. Address: Savar, Dhaka. Phone: 01400000000. Cash on delivery is okay.",
      },
      { id: "messenger-reply", label: "Send an ordinary follow-up to an active Messenger order and confirm it stays on the same lead." },
      { id: "whatsapp-live", label: "Send one WhatsApp test message and confirm the correct order/reply behaviour without changing existing Meta settings." },
    ],
    safety: {
      externalMessagesSent: false,
      customerRecordsCreated: false,
      secretsReturned: false,
    },
  };
}

function result(id: string, label: string, passed: boolean, detail = "No result was returned."): SmokeTestCheck {
  return { id, label, passed, detail };
}

function present(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function configuredOriginCount(value: string | null | undefined) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean).length;
}

async function safeFirst(env: LeadPilotEnv, query: string): Promise<LatestRow | null> {
  try {
    return await env.DB.prepare(query).first<LatestRow>();
  } catch {
    return null;
  }
}
