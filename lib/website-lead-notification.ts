import { getDb } from "../db";
import { ownerNotifications } from "../db/schema";
import { DEFAULT_BUSINESS_ID } from "./data";

type LeadSummary = {
  id: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  serviceRequested: string | null;
  location: string | null;
  expectedValue: number;
  createdAt: string;
};

export async function notifyWebsiteLead(
  lead: LeadSummary,
  source: string,
  kind: "landing_order" | "website_lead",
) {
  const db = getDb();
  const title = kind === "landing_order"
    ? `New landing-page order from ${lead.customerName}`
    : `New website lead from ${lead.customerName}`;
  const contact = lead.phone || lead.email || "Contact details pending";
  const offering = lead.serviceRequested || "Product or service pending";
  const value = lead.expectedValue > 0 ? ` · Value ${lead.expectedValue.toLocaleString("en-US")}` : "";
  const location = lead.location ? ` · ${lead.location}` : "";

  await db.insert(ownerNotifications).values({
    id: crypto.randomUUID(),
    businessId: DEFAULT_BUSINESS_ID,
    leadId: lead.id,
    type: kind,
    title,
    message: `${source} · ${contact} · ${offering}${value}${location}`.slice(0, 500),
    createdAt: lead.createdAt,
  });
}
