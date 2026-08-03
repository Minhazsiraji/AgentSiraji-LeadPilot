import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { whatsappIntegrations } from "../db/schema";
import { ensureSchema } from "./data";
import { decryptSecret, encryptSecret } from "./facebook-integration-core";
import type { LeadPilotEnv } from "./runtime-env";

const WHATSAPP_INTEGRATION_ID = "stepfresh-whatsapp";
const APP_SECRET_CONTEXT = "leadpilot:whatsapp:app-secret";
const ACCESS_TOKEN_CONTEXT = "leadpilot:whatsapp:access-token";
const VERIFY_TOKEN_CONTEXT = "leadpilot:whatsapp:verify-token";

export type WhatsAppConnectionMode = "coexistence" | "test";

export type WhatsAppRuntimeConfig = {
  appSecret: string | null;
  accessToken: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  connectionMode: WhatsAppConnectionMode | null;
  tokenExpiresAt: string | null;
  verifyToken: string | null;
};

export type WhatsAppIntegrationStatus = {
  configured: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  connectionMode: WhatsAppConnectionMode | null;
  tokenExpiresAt: string | null;
  updatedAt: string | null;
};

export async function saveWhatsAppIntegration(input: {
  appSecret: string;
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
  connectionMode: WhatsAppConnectionMode;
  tokenExpiresAt: string | null;
  verifyToken?: string | null;
  connectedBy: string;
}, env: LeadPilotEnv) {
  await ensureSchema();
  const now = new Date().toISOString();
  const appSecretEncrypted = await encryptSecret(
    input.appSecret,
    requireIntegrationKey(env),
    APP_SECRET_CONTEXT,
  );
  const accessTokenEncrypted = await encryptSecret(
    input.accessToken,
    requireIntegrationKey(env),
    ACCESS_TOKEN_CONTEXT,
  );
  const verifyTokenEncrypted = input.verifyToken
    ? await encryptSecret(
      input.verifyToken,
      requireIntegrationKey(env),
      VERIFY_TOKEN_CONTEXT,
    )
    : null;
  await getDb().insert(whatsappIntegrations).values({
    id: WHATSAPP_INTEGRATION_ID,
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    displayPhoneNumber: input.displayPhoneNumber,
    verifiedName: input.verifiedName,
    connectionMode: input.connectionMode,
    tokenExpiresAt: input.tokenExpiresAt,
    appSecretEncrypted,
    accessTokenEncrypted,
    verifyTokenEncrypted,
    connectedBy: input.connectedBy.trim().toLowerCase(),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: whatsappIntegrations.id,
    set: {
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber,
      verifiedName: input.verifiedName,
      connectionMode: input.connectionMode,
      tokenExpiresAt: input.tokenExpiresAt,
      appSecretEncrypted,
      accessTokenEncrypted,
      verifyTokenEncrypted,
      connectedBy: input.connectedBy.trim().toLowerCase(),
      updatedAt: now,
    },
  });
  return getWhatsAppIntegrationStatus();
}

export async function getWhatsAppIntegrationStatus(): Promise<WhatsAppIntegrationStatus> {
  await ensureSchema();
  const [row] = await getDb()
    .select({
      wabaId: whatsappIntegrations.wabaId,
      phoneNumberId: whatsappIntegrations.phoneNumberId,
      displayPhoneNumber: whatsappIntegrations.displayPhoneNumber,
      verifiedName: whatsappIntegrations.verifiedName,
      connectionMode: whatsappIntegrations.connectionMode,
      tokenExpiresAt: whatsappIntegrations.tokenExpiresAt,
      updatedAt: whatsappIntegrations.updatedAt,
    })
    .from(whatsappIntegrations)
    .where(eq(whatsappIntegrations.id, WHATSAPP_INTEGRATION_ID))
    .limit(1);
  return {
    configured: Boolean(row),
    wabaId: row?.wabaId ?? null,
    phoneNumberId: row?.phoneNumberId ?? null,
    displayPhoneNumber: row?.displayPhoneNumber ?? null,
    verifiedName: row?.verifiedName ?? null,
    connectionMode: row?.connectionMode === "test" ? "test" : row ? "coexistence" : null,
    tokenExpiresAt: row?.tokenExpiresAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function getWhatsAppRuntimeConfig(env: LeadPilotEnv): Promise<WhatsAppRuntimeConfig> {
  await ensureSchema();
  const [row] = await getDb()
    .select()
    .from(whatsappIntegrations)
    .where(eq(whatsappIntegrations.id, WHATSAPP_INTEGRATION_ID))
    .limit(1);
  if (!row) {
    return {
      appSecret: null,
      accessToken: null,
      wabaId: null,
      phoneNumberId: null,
      displayPhoneNumber: null,
      verifiedName: null,
      connectionMode: null,
      tokenExpiresAt: null,
      verifyToken: null,
    };
  }
  const key = requireIntegrationKey(env);
  return {
    appSecret: await decryptSecret(row.appSecretEncrypted, key, APP_SECRET_CONTEXT),
    accessToken: await decryptSecret(row.accessTokenEncrypted, key, ACCESS_TOKEN_CONTEXT),
    wabaId: row.wabaId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    verifiedName: row.verifiedName,
    connectionMode: row.connectionMode === "test" ? "test" : "coexistence",
    tokenExpiresAt: row.tokenExpiresAt,
    verifyToken: row.verifyTokenEncrypted
      ? await decryptSecret(row.verifyTokenEncrypted, key, VERIFY_TOKEN_CONTEXT)
      : null,
  };
}

export async function removeWhatsAppIntegration() {
  await ensureSchema();
  await getDb()
    .delete(whatsappIntegrations)
    .where(eq(whatsappIntegrations.id, WHATSAPP_INTEGRATION_ID));
}

function requireIntegrationKey(env: LeadPilotEnv) {
  const encodedKey = env.INTEGRATION_SECRETS_KEY?.trim();
  if (!encodedKey) throw new Error("INTEGRATION_SECRET_STORAGE_UNAVAILABLE");
  return encodedKey;
}
