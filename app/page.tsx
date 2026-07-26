import { getChatGPTUser } from "./chatgpt-auth";
import LeadPilotApp from "./leadpilot-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();

  return <LeadPilotApp initialNow={new Date().toISOString()} user={user} />;
}
