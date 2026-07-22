import { getChatGPTUser } from "../app/chatgpt-auth";
import { claimBusiness } from "./data";

export async function requireOwner(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return { response: Response.json({ error: "Sign in to access the owner workspace." }, { status: 401 }) } as const;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      return { response: Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 }) } as const;
    }
  }
  try {
    const business = await claimBusiness(user.email);
    return { user, business } as const;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN_OWNER") {
      return { response: Response.json({ error: "This workspace belongs to another owner." }, { status: 403 }) } as const;
    }
    throw error;
  }
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error("LeadPilot API error", error);
  return Response.json({ error: message.includes("D1") ? "The database is temporarily unavailable." : "LeadPilot could not complete that request." }, { status: 500 });
}
