"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function PublicEnquiryForm() {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setState("submitting");
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/public/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "We could not send your enquiry.");
      setMessage(result.message || "Your enquiry has been received.");
      setState("success");
      formElement.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We could not send your enquiry.");
      setState("error");
    }
  }

  return (
    <main className="enquiry-page">
      <section className="enquiry-story">
        <Link className="brand enquiry-brand" href="/"><span>AgentSiraji</span><strong>LeadPilot</strong></Link>
        <div>
          <p className="eyebrow">BrightHome Cleaning</p>
          <h1>Tell us what needs a fresh start.</h1>
          <p>Share the essentials. We’ll review your request and respond with the right next step—without making you repeat yourself.</p>
        </div>
        <ul>
          <li><span>01</span> Your details stay attached to one enquiry.</li>
          <li><span>02</span> No price or availability is promised before review.</li>
          <li><span>03</span> You can ask us to stop contact at any time.</li>
        </ul>
      </section>
      <section className="enquiry-panel">
        <div className="form-heading">
          <p className="eyebrow">Request a quote</p>
          <h2>How can we help?</h2>
          <p>Fields marked with * are required.</p>
        </div>
        <form onSubmit={submit}>
          <label>Full name *<input autoComplete="name" maxLength={120} name="customerName" required /></label>
          <div className="form-grid">
            <label>Email<input autoComplete="email" maxLength={180} name="email" type="email" /></label>
            <label>Phone<input autoComplete="tel" maxLength={60} name="phone" type="tel" /></label>
          </div>
          <label>What cleaning do you need? *<textarea maxLength={5000} minLength={10} name="message" placeholder="For example: I need a deep clean for a three-bedroom flat next Saturday…" required rows={6} /></label>
          <label className="honeypot" aria-hidden="true">Website<input autoComplete="off" name="companyWebsite" tabIndex={-1} /></label>
          <p className="form-note">Please include either an email address or phone number so the team can reply. By submitting, you agree to the <Link href="/privacy">privacy notice</Link>.</p>
          <button className="button button-primary form-submit" disabled={state === "submitting"} type="submit">{state === "submitting" ? "Sending…" : "Send enquiry"}</button>
          {state === "success" || state === "error" ? <div className={`form-result form-result-${state}`} role="status">{message}</div> : null}
        </form>
        <Link className="back-link" href="/">← Back to LeadPilot</Link>
      </section>
    </main>
  );
}
