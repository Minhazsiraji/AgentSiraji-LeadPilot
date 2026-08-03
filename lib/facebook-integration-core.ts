export function validateFacebookCredentialInput(appSecret: string, pageAccessToken: string) {
  const cleanSecret = appSecret.trim();
  const cleanToken = pageAccessToken.trim();
  if (!/^[a-f0-9]{32}$/i.test(cleanSecret)) {
    throw new Error("INVALID_FACEBOOK_APP_SECRET");
  }
  if (cleanToken.length < 40 || cleanToken.length > 2000 || /\s/.test(cleanToken)) {
    throw new Error("INVALID_FACEBOOK_PAGE_TOKEN");
  }
  return { appSecret: cleanSecret, pageAccessToken: cleanToken };
}

export type FacebookValidationFailureReason =
  | "app_id"
  | "app_secret"
  | "page_token"
  | "page_identity"
  | "permissions"
  | "unknown";

export class FacebookMetaValidationError extends Error {
  readonly reason: FacebookValidationFailureReason;
  readonly metaCode: number | null;
  readonly metaSubcode: number | null;

  constructor(
    reason: FacebookValidationFailureReason,
    metaCode: number | null,
    metaSubcode: number | null,
  ) {
    super("FACEBOOK_META_VALIDATION_FAILED");
    this.name = "FacebookMetaValidationError";
    this.reason = reason;
    this.metaCode = metaCode;
    this.metaSubcode = metaSubcode;
  }
}

export async function validateFacebookPageToken(
  pageAccessToken: string,
  appId: string,
  appSecret: string,
  expectedPage: { pageId?: string; pageName?: string } = {},
  graphVersion = "v26.0",
  fetcher: typeof fetch = fetch,
) {
  const cleanAppId = appId.trim();
  if (!/^\d{5,30}$/.test(cleanAppId)) {
    throw new FacebookMetaValidationError("app_id", null, null);
  }

  const debugUrl = new URL(`https://graph.facebook.com/${graphVersion}/debug_token`);
  debugUrl.searchParams.set("input_token", pageAccessToken);
  debugUrl.searchParams.set("access_token", `${cleanAppId}|${appSecret}`);
  const debugResponse = await fetcher(debugUrl, {
    headers: { accept: "application/json" },
  });
  const debugPayload = await debugResponse.json().catch(() => null) as {
    data?: {
      app_id?: unknown;
      is_valid?: unknown;
      profile_id?: unknown;
      scopes?: unknown;
      type?: unknown;
      user_id?: unknown;
    };
    error?: {
      code?: unknown;
      error_subcode?: unknown;
      message?: unknown;
      type?: unknown;
    };
  } | null;

  if (!debugResponse.ok || debugPayload?.error) {
    throw classifyMetaFailure(debugPayload?.error, "app_access");
  }

  const debugData = debugPayload?.data;
  if (debugData?.is_valid !== true) {
    throw new FacebookMetaValidationError("page_token", null, null);
  }
  const tokenAppId = normalizeMetaId(debugData.app_id);
  if (!tokenAppId || tokenAppId !== cleanAppId) {
    throw new FacebookMetaValidationError("app_id", null, null);
  }
  const tokenType = typeof debugData.type === "string"
    ? debugData.type.trim().toUpperCase()
    : "";
  if (tokenType !== "PAGE") {
    throw new FacebookMetaValidationError("page_token", null, null);
  }
  const scopes = Array.isArray(debugData.scopes)
    ? debugData.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  if (!scopes.includes("pages_messaging")) {
    throw new FacebookMetaValidationError("permissions", null, null);
  }
  const debugPageId = normalizeMetaId(debugData.profile_id)
    || normalizeMetaId(debugData.user_id);
  if (!debugPageId) {
    throw new FacebookMetaValidationError("page_identity", null, null);
  }

  const expectedPageId = normalizeMetaId(expectedPage.pageId);
  if (expectedPageId && debugPageId !== expectedPageId) {
    throw new FacebookMetaValidationError("page_identity", null, null);
  }
  // Meta's debug_token profile_id is the Page ID represented by a Page token.
  // A second Page-object lookup adds no security value and can require unrelated
  // Page-read permissions that Messenger delivery itself does not need.
  const pageName = expectedPage.pageName?.trim() || "Facebook Page";

  return {
    pageId: debugPageId.slice(0, 200),
    pageName: pageName.slice(0, 200),
  };
}

function normalizeMetaId(value: unknown) {
  if (typeof value === "string" && /^\d{3,30}$/.test(value.trim())) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return "";
}

function classifyMetaFailure(
  error: {
    code?: unknown;
    error_subcode?: unknown;
    message?: unknown;
    type?: unknown;
  } | undefined,
  requestKind: "app_access" | "page",
) {
  const metaMessage = typeof error?.message === "string"
    ? error.message.toLowerCase()
    : "";
  const metaCode = typeof error?.code === "number" ? error.code : null;
  const metaSubcode = typeof error?.error_subcode === "number"
    ? error.error_subcode
    : null;
  if (
    metaMessage.includes("appsecret_proof")
    || metaMessage.includes("app secret proof")
    || metaMessage.includes("app secret")
  ) {
    return new FacebookMetaValidationError("app_secret", metaCode, metaSubcode);
  }
  if (
    metaMessage.includes("app id")
    || metaMessage.includes("application id")
    || metaCode === 101
  ) {
    return new FacebookMetaValidationError("app_id", metaCode, metaSubcode);
  }
  if (metaCode === 10 || metaCode === 200 || metaMessage.includes("permission")) {
    return new FacebookMetaValidationError("permissions", metaCode, metaSubcode);
  }
  if (
    metaCode === 190
    || metaMessage.includes("access token")
    || metaMessage.includes("oauth")
  ) {
    return new FacebookMetaValidationError(
      requestKind === "app_access" ? "app_secret" : "page_token",
      metaCode,
      metaSubcode,
    );
  }
  return new FacebookMetaValidationError("unknown", metaCode, metaSubcode);
}

export async function createFacebookAppSecretProof(
  accessToken: string,
  appSecret: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(accessToken)),
  );
  return Array.from(
    digest,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function encryptSecret(value: string, encodedKey: string, context: string) {
  const key = await importIntegrationKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv,
    additionalData: new TextEncoder().encode(context),
  }, key, new TextEncoder().encode(value)));
  return `${toBase64(iv)}.${toBase64(ciphertext)}`;
}

export async function decryptSecret(payload: string, encodedKey: string, context: string) {
  const [ivEncoded, ciphertextEncoded, ...extra] = payload.split(".");
  if (!ivEncoded || !ciphertextEncoded || extra.length) {
    throw new Error("INVALID_ENCRYPTED_INTEGRATION_SECRET");
  }
  const key = await importIntegrationKey(encodedKey);
  const plaintext = await crypto.subtle.decrypt({
    name: "AES-GCM",
    iv: fromBase64(ivEncoded),
    additionalData: new TextEncoder().encode(context),
  }, key, fromBase64(ciphertextEncoded));
  return new TextDecoder().decode(plaintext);
}

async function importIntegrationKey(encodedKey: string) {
  const bytes = fromBase64(encodedKey);
  if (bytes.byteLength !== 32) throw new Error("INVALID_INTEGRATION_SECRETS_KEY");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
