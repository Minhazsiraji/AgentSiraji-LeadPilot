import Link from "next/link";
import { requireChatGPTUser } from "../../chatgpt-auth";
import FacebookConnectionForm from "./facebook-connection-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Facebook connection — AgentSiraji LeadPilot",
  description: "Securely connect a Facebook Page to LeadPilot Messenger intake.",
};

export default async function FacebookConnectionPage() {
  await requireChatGPTUser("/owner/facebook");
  return (
    <main className="integration-page">
      <article>
        <p className="eyebrow">AgentSiraji LeadPilot</p>
        <h1>Connect Facebook Messenger</h1>
        <p className="integration-intro">
          Add the Meta App Secret and StepFresh Page token here. They are encrypted
          before storage and are never displayed again.
        </p>
        <FacebookConnectionForm />
        <Link className="back-link" href="/owner">← Back to owner dashboard</Link>
      </article>
    </main>
  );
}
