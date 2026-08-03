export type WhatsAppCredentials = {
  appSecret: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
};

export type WhatsAppIdentity = {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  tokenExpiresAt: string | null;
};

export type WhatsAppEmbeddedSignupInput = {
  code: string;
  wabaId: string;
  phoneNumberId: string;
};

export type WhatsAppTestNumberInput = {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  verifyToken: string;
};

export type WhatsAppValidationFailureReason =
  | "app_id"
  | "app_secret"
  | "access_token"
  | "permissions"
  | "phone_identity"
  | "waba_identity"
  | "subscription"
  | "unknown";

export class WhatsAppMetaValidationError extends Error {
  readonly reason: WhatsAppValidationFailureReason;
  readonly metaCode: number | null;
  readonly metaSubcode: number | null;

  constructor(
    reason: WhatsAppValidationFailureReason,
    metaCode: number | null,
    metaSubcode: number | null,
  ) {
    super("WHATSAPP_META_VALIDATION_FAILED");
    this.name = "WhatsAppMetaValidationError";
    this.reason = reason;
    this.metaCode = metaCode;
    this.metaSubcode = metaSubcode;
  }
}

export function validateWhatsAppCredentialInput(input: {
  appSecret: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
}): WhatsAppCredentials {
  const appSecret = input.appSecret.trim();
  const accessToken = input.accessToken.trim();
  const wabaId = input.wabaId.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  if (!/^[a-f0-9]{32}$/i.test(appSecret)) throw new Error("INVALID_WHATSAPP_APP_SECRET");
  if (accessToken.length < 40 || accessToken.length > 4000 || /\s/.test(accessToken)) {
    throw new Error("INVALID_WHATSAPP_ACCESS_TOKEN");
  }
  if (!/^\d{5,30}$/.test(wabaId)) throw new Error("INVALID_WHATSAPP_WABA_ID");
  if (!/^\d{5,30}$/.test(phoneNumberId)) throw new Error("INVALID_WHATSAPP_PHONE_NUMBER_ID");
  return { appSecret, accessToken, wabaId, phoneNumberId };
}

export function validateWhatsAppTestNumberInput(input: {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  verifyToken: string;
}): WhatsAppTestNumberInput {
  const accessToken = input.accessToken.trim();
  const wabaId = input.wabaId.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  const verifyToken = input.verifyToken.trim();
  if (accessToken.length < 40 || accessToken.length > 4000 || /\s/.test(accessToken)) {
    throw new Error("INVALID_WHATSAPP_ACCESS_TOKEN");
  }
  if (!/^\d{5,30}$/.test(wabaId)) throw new Error("INVALID_WHATSAPP_WABA_ID");
  if (!/^\d{5,30}$/.test(phoneNumberId)) {
    throw new Error("INVALID_WHATSAPP_PHONE_NUMBER_ID");
  }
  if (
    verifyToken.length < 16
    || verifyToken.length > 200
    || !/^[A-Za-z0-9._~-]+$/.test(verifyToken)
  ) {
    throw new Error("INVALID_WHATSAPP_VERIFY_TOKEN");
  }
  return { accessToken, wabaId, phoneNumberId, verifyToken };
}

export function validateWhatsAppEmbeddedSignupInput(input: {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}): WhatsAppEmbeddedSignupInput {
  const code = input.code.trim();
  const wabaId = input.wabaId.trim();
  const phoneNumberId = input.phoneNumberId.trim();
  if (
    code.length < 20
    || code.length > 4000
    || /\s/.test(code)
  ) {
    throw new Error("INVALID_WHATSAPP_AUTHORIZATION_CODE");
  }
  if (!/^\d{5,30}$/.test(wabaId)) throw new Error("INVALID_WHATSAPP_WABA_ID");
  if (!/^\d{5,30}$/.test(phoneNumberId)) {
    throw new Error("INVALID_WHATSAPP_PHONE_NUMBER_ID");
  }
  return { code, wabaId, phoneNumberId };
}

export async function exchangeWhatsAppEmbeddedSignupCode(
  input: {
    appId: string;
    appSecret: string;
    code: string;
  },
  graphVersion = "v26.0",
  fetcher: typeof fetch = fetch,
) {
  const appId = input.appId.trim();
  const appSecret = input.appSecret.trim();
  const code = input.code.trim();
  if (!/^\d{5,30}$/.test(appId)) {
    throw new WhatsAppMetaValidationError("app_id", null, null);
  }
  if (!/^[a-f0-9]{32}$/i.test(appSecret)) {
    throw new WhatsAppMetaValidationError("app_secret", null, null);
  }
  if (
    code.length < 20
    || code.length > 4000
    || /\s/.test(code)
  ) {
    throw new WhatsAppMetaValidationError("access_token", null, null);
  }

  const exchangeUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  exchangeUrl.searchParams.set("client_id", appId);
  exchangeUrl.searchParams.set("client_secret", appSecret);
  exchangeUrl.searchParams.set("code", code);
  const response = await fetcher(exchangeUrl, { headers: { accept: "application/json" } });
  const payload = await readMetaPayload(response);
  if (!response.ok || payload.error) {
    throw classifyMetaFailure(payload.error, "app");
  }
  const accessToken = cleanText(payload.access_token, 4000);
  if (!accessToken || /\s/.test(accessToken)) {
    throw new WhatsAppMetaValidationError("access_token", null, null);
  }
  return accessToken;
}

export async function validateWhatsAppConnection(
  credentials: WhatsAppCredentials,
  appId: string,
  graphVersion = "v26.0",
  fetcher: typeof fetch = fetch,
): Promise<WhatsAppIdentity> {
  const cleanAppId = appId.trim();
  if (!/^\d{5,30}$/.test(cleanAppId)) {
    throw new WhatsAppMetaValidationError("app_id", null, null);
  }

  const debugUrl = new URL(`https://graph.facebook.com/${graphVersion}/debug_token`);
  debugUrl.searchParams.set("input_token", credentials.accessToken);
  debugUrl.searchParams.set("access_token", `${cleanAppId}|${credentials.appSecret}`);
  const debugResponse = await fetcher(debugUrl, { headers: { accept: "application/json" } });
  const debugPayload = await readMetaPayload(debugResponse);
  if (!debugResponse.ok || debugPayload.error) {
    throw classifyMetaFailure(debugPayload.error, "app");
  }
  const debugData = isRecord(debugPayload.data) ? debugPayload.data : {};
  if (debugData.is_valid !== true) {
    throw new WhatsAppMetaValidationError("access_token", null, null);
  }
  if (normalizeMetaId(debugData.app_id) !== cleanAppId) {
    throw new WhatsAppMetaValidationError("app_id", null, null);
  }
  const scopes = Array.isArray(debugData.scopes)
    ? debugData.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  if (
    !scopes.includes("whatsapp_business_messaging")
    || !scopes.includes("whatsapp_business_management")
  ) {
    throw new WhatsAppMetaValidationError("permissions", null, null);
  }
  const expiresAtSeconds = typeof debugData.expires_at === "number"
    ? debugData.expires_at
    : typeof debugData.expires_at === "string"
      ? Number(debugData.expires_at)
      : Number.NaN;
  const tokenExpiresAt = Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0
    ? new Date(expiresAtSeconds * 1_000).toISOString()
    : null;

  const phoneUrl = new URL(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(credentials.phoneNumberId)}`,
  );
  phoneUrl.searchParams.set("fields", "id,display_phone_number,verified_name");
  phoneUrl.searchParams.set("access_token", credentials.accessToken);
  const phoneResponse = await fetcher(phoneUrl, { headers: { accept: "application/json" } });
  const phonePayload = await readMetaPayload(phoneResponse);
  if (!phoneResponse.ok || phonePayload.error) {
    throw classifyMetaFailure(phonePayload.error, "phone");
  }
  const phoneId = normalizeMetaId(phonePayload.id);
  if (phoneId !== credentials.phoneNumberId) {
    throw new WhatsAppMetaValidationError("phone_identity", null, null);
  }
  const displayPhoneNumber = cleanText(phonePayload.display_phone_number, 80);
  const verifiedName = cleanText(phonePayload.verified_name, 200);
  if (!displayPhoneNumber || !verifiedName) {
    throw new WhatsAppMetaValidationError("phone_identity", null, null);
  }

  const numbersUrl = new URL(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(credentials.wabaId)}/phone_numbers`,
  );
  numbersUrl.searchParams.set("fields", "id");
  numbersUrl.searchParams.set("access_token", credentials.accessToken);
  const numbersResponse = await fetcher(numbersUrl, { headers: { accept: "application/json" } });
  const numbersPayload = await readMetaPayload(numbersResponse);
  if (!numbersResponse.ok || numbersPayload.error) {
    throw classifyMetaFailure(numbersPayload.error, "waba");
  }
  const phoneBelongsToWaba = Array.isArray(numbersPayload.data)
    && numbersPayload.data.some((item) => isRecord(item) && normalizeMetaId(item.id) === phoneId);
  if (!phoneBelongsToWaba) {
    throw new WhatsAppMetaValidationError("waba_identity", null, null);
  }

  const subscriptionUrl = new URL(
    `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(credentials.wabaId)}/subscribed_apps`,
  );
  subscriptionUrl.searchParams.set("access_token", credentials.accessToken);
  const subscriptionResponse = await fetcher(subscriptionUrl, {
    method: "POST",
    headers: { accept: "application/json" },
  });
  const subscriptionPayload = await readMetaPayload(subscriptionResponse);
  if (
    !subscriptionResponse.ok
    || subscriptionPayload.error
    || subscriptionPayload.success !== true
  ) {
    const classified = classifyMetaFailure(subscriptionPayload.error, "subscription");
    throw new WhatsAppMetaValidationError(
      classified.reason === "unknown" ? "subscription" : classified.reason,
      classified.metaCode,
      classified.metaSubcode,
    );
  }

  return {
    wabaId: credentials.wabaId,
    phoneNumberId: phoneId,
    displayPhoneNumber,
    verifiedName,
    tokenExpiresAt,
  };
}

async function readMetaPayload(response: Response): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  return isRecord(payload) ? payload : {};
}

function classifyMetaFailure(
  value: unknown,
  requestKind: "app" | "phone" | "waba" | "subscription",
) {
  const error = isRecord(value) ? value : {};
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const metaCode = typeof error.code === "number" ? error.code : null;
  const metaSubcode = typeof error.error_subcode === "number" ? error.error_subcode : null;
  if (message.includes("app secret") || message.includes("appsecret")) {
    return new WhatsAppMetaValidationError("app_secret", metaCode, metaSubcode);
  }
  if (message.includes("app id") || metaCode === 101) {
    return new WhatsAppMetaValidationError("app_id", metaCode, metaSubcode);
  }
  if (metaCode === 10 || metaCode === 200 || message.includes("permission")) {
    return new WhatsAppMetaValidationError("permissions", metaCode, metaSubcode);
  }
  if (metaCode === 190 || message.includes("access token") || message.includes("oauth")) {
    return new WhatsAppMetaValidationError("access_token", metaCode, metaSubcode);
  }
  if (requestKind === "phone") {
    return new WhatsAppMetaValidationError("phone_identity", metaCode, metaSubcode);
  }
  if (requestKind === "waba") {
    return new WhatsAppMetaValidationError("waba_identity", metaCode, metaSubcode);
  }
  if (requestKind === "subscription") {
    return new WhatsAppMetaValidationError("subscription", metaCode, metaSubcode);
  }
  return new WhatsAppMetaValidationError("unknown", metaCode, metaSubcode);
}

function normalizeMetaId(value: unknown) {
  if (typeof value === "string" && /^\d{3,30}$/.test(value.trim())) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return "";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
