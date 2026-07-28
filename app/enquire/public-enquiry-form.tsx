"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BANGLADESH_DISTRICTS } from "../../lib/public-order";

export default function PublicEnquiryForm() {
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [quantity, setQuantity] = useState(1);
  const total = Math.floor(quantity / 2) * 800 + (quantity % 2) * 450;

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
      setQuantity(1);
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
          <p className="eyebrow">StepFresh · @stepfresh.bd</p>
          <h1>Fresh shoes start here.</h1>
          <p>Choose your package and share the delivery details. We’ll confirm your order before dispatch.</p>
        </div>
        <ul>
          <li><span>01</span> One bottle ৳450 · Two bottles ৳800.</li>
          <li><span>02</span> Free delivery · Cash on delivery nationwide.</li>
          <li><span>03</span> A person reviews every order before confirmation.</li>
        </ul>
      </section>
      <section className="enquiry-panel">
        <div className="form-heading">
          <p className="eyebrow">Order form</p>
          <h2>Where should we deliver?</h2>
          <p>Fields marked with * are required.</p>
        </div>
        <form onSubmit={submit}>
          <label>Full name *<input autoComplete="name" maxLength={120} name="customerName" required /></label>
          <div className="form-grid">
            <label>Bangladesh mobile number *<input autoComplete="tel" inputMode="tel" maxLength={14} name="phone" pattern="(?:\+?880|0)1[3-9][0-9]{8}" placeholder="01712345678" required type="tel" /></label>
            <label>Order quantity *
              <select name="quantity" onChange={(event) => setQuantity(Number(event.target.value))} required value={quantity}>
                {Array.from({ length: 20 }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{item} {item === 1 ? "bottle" : "bottles"}</option>)}
              </select>
            </label>
          </div>
          <div className="order-summary"><span>Order total</span><strong>৳{total.toLocaleString("en-US")}</strong><small>Free delivery nationwide</small></div>
          <div className="form-grid">
            <label>District *
              <select defaultValue="" name="district" required>
                <option disabled value="">Select district</option>
                {BANGLADESH_DISTRICTS.map((district) => <option key={district} value={district}>{district}</option>)}
              </select>
            </label>
            <label>Thana / Upazila *<input autoComplete="address-level2" maxLength={80} minLength={2} name="thana" placeholder="Example: Savar" required /></label>
          </div>
          <label>Full delivery address *<textarea autoComplete="street-address" maxLength={300} minLength={10} name="address" placeholder="House/road, village or area, nearby landmark" required rows={4} /></label>
          <label>Order note (optional)<textarea maxLength={500} name="note" placeholder="Any delivery instruction or preferred call time" rows={2} /></label>
          <label className="order-check"><input name="codConfirmed" required type="checkbox" /> I agree to pay ৳{total.toLocaleString("en-US")} by cash on delivery.</label>
          <label className="order-check"><input name="detailsConfirmed" required type="checkbox" /> I confirm that my phone number and delivery details are correct.</label>
          <label className="honeypot" aria-hidden="true">Website<input autoComplete="off" name="companyWebsite" tabIndex={-1} /></label>
          <p className="form-note">StepFresh will call this number before dispatch. An order is not confirmed until phone verification. By submitting, you agree to the <Link href="/privacy">privacy notice</Link>.</p>
          <button className="button button-primary form-submit" disabled={state === "submitting"} type="submit">{state === "submitting" ? "Sending…" : `Place order · ৳${total.toLocaleString("en-US")}`}</button>
          {state === "success" || state === "error" ? <div className={`form-result form-result-${state}`} role="status">{message}</div> : null}
        </form>
        <Link className="back-link" href="/">← Back to LeadPilot</Link>
      </section>
    </main>
  );
}
