import Link from "next/link";

export const metadata = {
  title: "Data deletion — AgentSiraji LeadPilot",
  description: "How a StepFresh Messenger customer can request deletion of data stored by AgentSiraji LeadPilot.",
};

export default function DataDeletionPage() {
  return (
    <main className="privacy-page">
      <article>
        <p className="eyebrow">AgentSiraji LeadPilot</p>
        <h1>Data deletion instructions</h1>
        <p className="privacy-updated">StepFresh pilot · updated July 31, 2026</p>

        <section>
          <h2>What LeadPilot may store</h2>
          <p>
            When you message the connected StepFresh Facebook Page, LeadPilot may store your Messenger identifier,
            available display name, the messages you send, contact or delivery details you voluntarily provide, and
            the lead or order workflow created to help StepFresh respond.
          </p>
        </section>

        <section>
          <h2>How to request deletion</h2>
          <p>
            Open your conversation with the StepFresh Facebook Page and send the exact words “delete my data”. If
            needed, include the phone number or order details you previously supplied so the owner can locate the
            correct record. Do not send identity documents, payment-card information, passwords, or other sensitive
            information.
          </p>
        </section>

        <section>
          <h2>What happens next</h2>
          <p>
            The StepFresh owner will verify the request through the same Messenger conversation, permanently delete
            the linked LeadPilot customer record and its analysis, drafts, follow-up tasks, notifications, and activity
            history, and confirm completion through Messenger. Verified requests are normally completed within seven
            business days.
          </p>
        </section>

        <section>
          <h2>Scope of deletion</h2>
          <p>
            This process deletes data stored by AgentSiraji LeadPilot for the StepFresh pilot. It does not delete copies
            of messages or account information retained by Meta. You can separately manage your Facebook information
            and connected apps from your Facebook account settings.
          </p>
        </section>

        <section>
          <h2>Stop future contact</h2>
          <p>
            You may also send “do not contact me”. LeadPilot will mark the record as Do Not Contact and cancel pending
            follow-ups without deleting the historical record unless you also request deletion.
          </p>
        </section>

        <div className="button-row">
          <Link className="button button-secondary" href="/privacy">Read the privacy notice</Link>
          <Link className="button button-secondary" href="/enquire">Back to StepFresh</Link>
        </div>
      </article>
    </main>
  );
}
