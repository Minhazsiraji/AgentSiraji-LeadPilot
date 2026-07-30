import { AsyncLocalStorage } from "node:async_hooks";

export type LeadPilotEnv = {
  DB: D1Database;
  WORKSPACE_OWNER_EMAIL?: string;
  ASSETS?: Fetcher;
  IMAGES?: unknown;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  AI_PROVIDER?: "gemini" | "openai" | "rules";
  FACEBOOK_VERIFY_TOKEN?: string;
  FACEBOOK_APP_SECRET?: string;
  FACEBOOK_PAGE_ACCESS_TOKEN?: string;
  FACEBOOK_PAGE_ID?: string;
  FACEBOOK_GRAPH_API_VERSION?: string;
};

const storageKey = Symbol.for("agentsiraji.leadpilot.request-env");
const shared = globalThis as typeof globalThis & { [storageKey]?: AsyncLocalStorage<LeadPilotEnv> };
const requestEnv = shared[storageKey] ?? new AsyncLocalStorage<LeadPilotEnv>();
shared[storageKey] = requestEnv;

export function runWithCloudflareEnv<T>(env: LeadPilotEnv, callback: () => T): T {
  return requestEnv.run(env, callback);
}

export function getCloudflareEnv(): LeadPilotEnv {
  const current = requestEnv.getStore();
  if (!current) throw new Error("Cloudflare request environment is unavailable.");
  return current;
}
