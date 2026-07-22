import Link from "next/link";

export const metadata = {
  title: "Privacy notice — AgentSiraji LeadPilot",
  description: "How the LeadPilot demonstration handles enquiry data.",
};

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <article>
        <p className="eyebrow">AgentSiraji LeadPilot</p>
        <h1>Privacy notice</h1>
        <p className="privacy-updated">Demonstration version · updated July 22, 2026</p>
        <section><h2>What is collected</h2><p>When you submit the enquiry form, LeadPilot stores the name, email address or phone number, enquiry message, source, and workflow information created to help the business respond.</p></section>
        <section><h2>Why it is used</h2><p>The information is used only to review the enquiry, prepare a response for human approval, arrange follow-ups, and measure response performance. LeadPilot does not perform bulk cold outreach.</p></section>
        <section><h2>Human approval and AI</h2><p>Generated messages require owner approval before they are recorded or sent. Business rules prevent unverified claims about price, availability, and services. When an AI provider is configured, the submitted message may be processed to extract relevant lead details and prepare a draft.</p></section>
        <section><h2>Retention and deletion</h2><p>The business owner can permanently delete a customer record and its analysis, drafts, follow-up tasks, and activity history from the lead detail view.</p></section>
        <section><h2>Your choices</h2><p>You may ask the business to correct your information or stop contacting you. A Do Not Contact request cancels pending follow-ups.</p></section>
        <section><h2>Portfolio demonstration</h2><p>BrightHome Cleaning is fictional. Do not submit sensitive, confidential, payment, identity, or health information to this demonstration.</p></section>
        <Link className="button button-secondary" href="/enquire">Back to enquiry form</Link>
      </article>
    </main>
  );
}
