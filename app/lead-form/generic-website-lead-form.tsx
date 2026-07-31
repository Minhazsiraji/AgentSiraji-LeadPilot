"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import type { BusinessProfile } from "../../lib/types";

export default function GenericWebsiteLeadForm({
  profile,
  sourceName,
}: {
  profile: BusinessProfile;
  sourceName: string;
}) {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setState("submitting");
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries()) as Record<string, unknown>;
    payload.pageUrl = document.referrer || window.location.href;

    try {
      const response = await fetch("/api/public/website-leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
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
          <p className="eyebrow">{profile.name}</p>
          <h1>Tell us what you need.</h1>
          <p>Your enquiry will be captured in LeadPilot, reviewed by a person, and followed through until there is a clear outcome.</p>
        </div>
        <ul>
          <li><span>01</span> Website and Facebook-page leads enter one inbox.</li>
          <li><span>02</span> Lead details are organised automatically.</li>
          <li><span>03</span> A person approves replies before sending.</li>
        </ul>
      </section>

      <section className="enquiry-panel">
        <div className="form-heading">
          <p className="eyebrow">Enquiry form</p>
          <h2>How can {profile.name} help?</h2>
          <p>Enter at least one contact method. Fields marked with * are required.</p>
        </div>

        <form onSubmit={submit}>
          <input name="sourceName" type="hidden" value={sourceName} readOnly />
          <label>Full name *<input autoComplete="name" maxLength={120} name="customerName" required /></label>
          <div className="form-grid">
            <label>Email<input autoComplete="email" maxLength={200} name="email" type="email" /></label>
            <label>Phone<input autoComplete="tel" inputMode="tel" maxLength={40} name="phone" type="tel" /></label>
          </div>

          {profile.services.length ? (
            <label>Product or service
              <select defaultValue="" name="service">
                <option value="">Choose an option</option>
                {profile.services.map((service) => <option key={service} value={service}>{service}</option>)}
              </select>
            </label>
          ) : null}

          <div className="form-grid">
            <label>Location<input autoComplete="address-level2" list="leadpilot-service-areas" maxLength={300} name="location" /></label>
            <label>Estimated value or budget ({profile.currency})<input inputMode="decimal" min="0" name="expectedValue" step="0.01" type="number" /></label>
          </div>
          {profile.serviceAreas.length ? <datalist id="leadpilot-service-areas">{profile.serviceAreas.map((area) => <option key={area} value={area} />)}</datalist> : null}

          <label>What do you need? *<textarea maxLength={5000} minLength={5} name="message" placeholder="Describe the product, service, quantity, timing, or question." required rows={6} /></label>
          <label className="honeypot" aria-hidden="true">Company website<input autoComplete="off" name="companyWebsite" tabIndex={-1} /></label>
          <p className="form-note">By submitting, you agree to the <Link href="/privacy">privacy notice</Link>. Do not include passwords, payment-card details, identity documents, or sensitive personal information.</p>
          <button className="button button-primary form-submit" disabled={state === "submitting"} type="submit">{state === "submitting" ? "Sending…" : "Send enquiry"}</button>
          {state === "success" || state === "error" ? <div className={`form-result form-result-${state}`} role="status">{message}</div> : null}
        </form>

        <Link className="back-link" href="/">← Back to LeadPilot</Link>
      </section>
    </main>
  );
}
