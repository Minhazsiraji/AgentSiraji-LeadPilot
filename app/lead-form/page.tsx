import { businessRowToProfile, ensureBusiness } from "../../lib/data";
import GenericWebsiteLeadForm from "./generic-website-lead-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact the business — AgentSiraji LeadPilot",
  description: "Submit a website enquiry for human review and follow-up.",
};

export default async function LeadFormPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const business = await ensureBusiness();
  const profile = businessRowToProfile(business);
  const params = await searchParams;
  const sourceName = typeof params.source === "string"
    ? params.source.trim().slice(0, 80)
    : "Hosted lead form";

  return <GenericWebsiteLeadForm profile={profile} sourceName={sourceName || "Hosted lead form"} />;
}
