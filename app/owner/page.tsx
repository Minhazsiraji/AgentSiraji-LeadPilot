import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import LeadPilotApp from "../leadpilot-app";

export const dynamic = "force-dynamic";

export default async function OwnerWorkspace() {
  const user = await requireChatGPTUser("/owner");

  return (
    <>
      <Link
        className="button button-secondary"
        href="/integrations"
        style={{ position: "fixed", right: "18px", bottom: "18px", zIndex: 40, boxShadow: "0 10px 28px rgba(35,49,62,.18)" }}
      >
        Integration health
      </Link>
      <LeadPilotApp initialNow={new Date().toISOString()} user={user} />
    </>
  );
}
