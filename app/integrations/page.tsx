import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import IntegrationHealthPanel from "./integration-health-panel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Integration health — AgentSiraji LeadPilot",
  description: "Owner-only configuration health and safe deployment smoke tests.",
};

export default async function IntegrationsPage() {
  const user = await requireChatGPTUser("/integrations");

  return (
    <main style={{ minHeight: "100vh", background: "#f3efe6", padding: "24px" }}>
      <div style={{ width: "min(1180px, 100%)", margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "18px" }}>
          <Link className="brand" href="/owner"><span>AgentSiraji</span><strong>LeadPilot</strong></Link>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", color: "#60717e", fontSize: "12px" }}>
            <span>Signed in as {user.displayName}</span>
            <Link className="button button-secondary" href="/owner">Back to workspace</Link>
          </div>
        </header>
        <IntegrationHealthPanel />
      </div>
    </main>
  );
}
