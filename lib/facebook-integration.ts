import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { facebookIntegrations } from "../db/schema";
import { ensureSchema } from "./data";
import { decryptSecret, encryptSecret } from "./facebook-integration-core";
import type { LeadPilotEnv } from "./runtime-env";

const FACEBOOK_INTEGRATION_ID = "stepfresh-facebook";
const APP_SECRET_CONTEXT = "leadpilot:facebook:app-secret";
const PAGE_TOKEN_CONTEXT = "leadpilot:facebook:page-token";

export type FacebookRuntimeConfig = {
  appSecret: string | null;
  pageAccessToken: string | null;
  pageId: string | null;
  pageName: string | null;
};

export type FacebookIntegrationStatus = {
  configured: boolean;
  pageId: string | null;
  pageName: string | null;
  updatedAt: string | null;
};

export async function saveFacebookIntegration(input: {
  appSecret: string;
  pageAccessToken: string;
  pageId: string;
  pageName: string;
  connectedBy: string;
}, env: LeadPilotEnv) {
  await ensureSchema();
  const now = new Date().toISOString();
  const appSecretEncrypted = await encryptSecret(
    input.appSecret,
    requireIntegrationKey(env),
    APP_SECRET_CONTEXT,
  );
  const pageAccessTokenEncrypted = await encryptSecret(
    input.pageAccessToken,
    requireIntegrationKey(env),
    PAGE_TOKEN_CONTEXT,
  );
  await getDb().insert(facebookIntegrations).values({
    id: FACEBOOK_INTEGRATION_ID,
    pageId: input.pageId,
    pageName: input.pageName,
    appSecretEncrypted,
    pageAccessTokenEncrypted,
    connectedBy: input.connectedBy.trim().toLowerCase(),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: facebookIntegrations.id,
    set: {
      pageId: input.pageId,
      pageName: input.pageName,
      appSecretEncrypted,
      pageAccessTokenEncrypted,
      connectedBy: input.connectedBy.trim().toLowerCase(),
      updatedAt: now,
    },
  });
  return getFacebookIntegrationStatus();
}

export async function getFacebookIntegrationStatus(): Promise<FacebookIntegrationStatus> {
  await ensureSchema();
  const [row] = await getDb()
    .select({
      pageId: facebookIntegrations.pageId,
      pageName: facebookIntegrations.pageName,
      updatedAt: facebookIntegrations.updatedAt,
    })
    .from(facebookIntegrations)
    .where(eq(facebookIntegrations.id, FACEBOOK_INTEGRATION_ID))
    .limit(1);
  return {
    configured: Boolean(row),
    pageId: row?.pageId ?? null,
    pageName: row?.pageName ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function getFacebookRuntimeConfig(env: LeadPilotEnv): Promise<FacebookRuntimeConfig> {
  await ensureSchema();
  const [row] = await getDb()
    .select()
    .from(facebookIntegrations)
    .where(eq(facebookIntegrations.id, FACEBOOK_INTEGRATION_ID))
    .limit(1);
  if (!row) {
    return {
      appSecret: env.FACEBOOK_APP_SECRET?.trim() || null,
      pageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() || null,
      pageId: env.FACEBOOK_PAGE_ID?.trim() || null,
      pageName: null,
    };
  }
  const key = requireIntegrationKey(env);
  return {
    appSecret: await decryptSecret(row.appSecretEncrypted, key, APP_SECRET_CONTEXT),
    pageAccessToken: await decryptSecret(
      row.pageAccessTokenEncrypted,
      key,
      PAGE_TOKEN_CONTEXT,
    ),
    pageId: row.pageId,
    pageName: row.pageName,
  };
}

export async function removeFacebookIntegration() {
  await ensureSchema();
  await getDb()
    .delete(facebookIntegrations)
    .where(eq(facebookIntegrations.id, FACEBOOK_INTEGRATION_ID));
}

function requireIntegrationKey(env: LeadPilotEnv) {
  const encodedKey = env.INTEGRATION_SECRETS_KEY?.trim();
  if (!encodedKey) throw new Error("INTEGRATION_SECRET_STORAGE_UNAVAILABLE");
  return encodedKey;
}
