# LeadPilot deployment health and smoke test

After publishing a new LeadPilot Site build, sign in to the owner workspace and open:

`https://YOUR-LEADPILOT-SITE/integrations`

The Integration Health page is owner-only. It reports configuration presence and stored activity without returning secret values, sending external messages, or creating customer records.

## Automatic safe checks

Use **Run safe smoke test** to verify:

1. D1 is accessible and the LeadPilot schema is available.
2. The configured business profile loads.
3. The StepFresh `/enquire` route can use the active workspace.
4. The reusable `/lead-form` can use the active workspace.
5. Messenger runtime configuration is present.
6. The existing-website API has a server-side integration key.
7. Gemini, OpenAI, or the deterministic rules fallback is available.

These checks deliberately do not call Meta, send WhatsApp or Messenger messages, invoke a paid AI provider, or insert a test lead.

## Manual live checks

Complete these in order after every deployment that changes intake, messaging, workflow, authentication, or database code.

### 1. StepFresh order form

Open `/enquire`, submit a unique test order, and confirm:

- a separate lead row is created;
- source is `StepFresh landing page`;
- package, value, phone, district and thana are correct;
- an owner notification is created.

### 2. Reusable client form

Open `/lead-form?source=Deployment%20smoke%20test`, submit a unique enquiry, and confirm:

- source is `Website · Deployment smoke test`;
- the lead is not merged with the StepFresh order;
- an owner notification is created.

### 3. Messenger repeat order

From a Messenger account whose previous order is already Delivered, Cancelled or Returned, send:

```text
I want to order 2 bottles of StepFresh.
Name: Deployment Test
Address: Savar, Dhaka
Phone: 01400000000
Cash on delivery is okay.
```

Confirm a new Messenger lead is created instead of attaching the order to the completed lead.

### 4. Messenger ordinary reply

Send a non-order follow-up to an active Messenger order. Confirm it is recorded on the active lead rather than creating a new lead.

### 5. WhatsApp

Send one test message through the configured WhatsApp environment. Confirm the correct lead or reply behaviour. Do not change the Meta webhook, tokens, phone number, D1 binding or existing integration settings merely to perform this check.

### 6. Secure website API

From an approved server environment:

- wrong integration key returns HTTP 401;
- disallowed browser origin returns HTTP 403;
- valid server-side key returns HTTP 201 for a new lead;
- duplicate submission returns HTTP 200 and does not create another lead.

## Interpreting WhatsApp health

The health page can report either configured Cloud API runtime values or recent stored lead activity with a WhatsApp source. It does not send a test message and does not by itself prove that Meta delivered a webhook. The manual live test remains required.

## Security rules

- Never paste tokens, app secrets, API keys or passwords into the health page.
- Never add secrets to GitHub or screenshots.
- The health APIs require the authenticated workspace owner.
- The browser receives only boolean configuration flags, endpoints and non-sensitive timestamps.
- Each client should use a separate LeadPilot deployment and separate secrets until multi-tenant isolation is implemented.
