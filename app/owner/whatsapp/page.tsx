import Link from "next/link";
import { requireChatGPTUser } from "../../chatgpt-auth";
import WhatsAppConnectionForm from "./whatsapp-connection-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "WhatsApp connection — AgentSiraji LeadPilot",
  description: "Securely connect WhatsApp Business to LeadPilot order intake.",
};

export default async function WhatsAppConnectionPage() {
  await requireChatGPTUser("/owner/whatsapp");
  return (
    <main className="integration-page">
      <article>
        <p className="eyebrow">AgentSiraji LeadPilot</p>
        <h1>Connect WhatsApp Business</h1>
        <p className="integration-intro">
          Test the complete order workflow with Meta&apos;s temporary number now,
          then connect the existing StepFresh WhatsApp Business number after
          business verification.
        </p>
        <WhatsAppConnectionForm />
        <Link className="back-link" href="/owner">← Back to owner dashboard</Link>
      </article>
    </main>
  );
}
