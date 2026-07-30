import Link from "next/link";

export const metadata = {
  title: "Privacy notice — AgentSiraji LeadPilot",
  description: "How LeadPilot handles order-form and Facebook Messenger enquiry data.",
};

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <article>
        <p className="eyebrow">AgentSiraji LeadPilot</p>
        <h1>Privacy notice</h1>
        <p className="privacy-updated">StepFresh pilot · updated July 30, 2026</p>
        <section><h2>What is collected</h2><p>When you submit the order form or message the connected StepFresh Facebook Page, LeadPilot stores the available name or Messenger identifier, contact details you provide, enquiry message, source, and workflow information created to help the business respond.</p></section>
        <section><h2>Why it is used</h2><p>The information is used only to review the enquiry, prepare a response for human approval, arrange follow-ups, and measure response performance. LeadPilot does not perform bulk cold outreach.</p></section>
        <section><h2>Human approval and AI</h2><p>Generated messages require owner approval before they are recorded or sent. Business rules prevent unverified claims about price, availability, and services. When an AI provider is configured, the submitted message may be processed to extract relevant lead details and prepare a draft.</p></section>
        <section><h2>Retention and deletion</h2><p>The business owner can permanently delete a customer record and its analysis, drafts, follow-up tasks, and activity history from the lead detail view. To request deletion of information received through Facebook Messenger, message the StepFresh Page with “delete my data”; the owner will locate and permanently delete the linked LeadPilot record.</p></section>
        <section><h2>Your choices</h2><p>You may ask the business to correct your information or stop contacting you. A Do Not Contact request cancels pending follow-ups.</p></section>
        <section><h2>Pilot notice</h2><p>This is the StepFresh pilot of AgentSiraji LeadPilot. Do not submit payment-card, identity-document, health, or other sensitive information.</p></section>
        <Link className="button button-secondary" href="/enquire">Back to enquiry form</Link>
      </article>
    </main>
  );
}
