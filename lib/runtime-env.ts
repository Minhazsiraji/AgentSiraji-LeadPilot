import { AsyncLocalStorage } from "node:async_hooks";

export type LeadPilotEnv = {
  DB: D1Database;
  ASSETS?: Fetcher;
  IMAGES?: unknown;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
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
