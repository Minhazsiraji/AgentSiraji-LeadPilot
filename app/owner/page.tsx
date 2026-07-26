import { requireChatGPTUser } from "../chatgpt-auth";
import LeadPilotApp from "../leadpilot-app";

export const dynamic = "force-dynamic";

export default async function OwnerWorkspace() {
  const user = await requireChatGPTUser("/owner");

  return <LeadPilotApp initialNow={new Date().toISOString()} user={user} />;
}
