# Website and landing-page lead connectors

LeadPilot supports two website intake paths. Both create normal LeadPilot leads, run the same scoring and draft workflow, and notify the workspace owner.

## 1. StepFresh landing page

The StepFresh order landing page is already hosted by LeadPilot at:

`https://agentsiraji-leadpilot.minhazsiraji.chatgpt.site/enquire`

Every valid submission is stored with the source `StepFresh landing page`. The owner receives a landing-page order notification, and the order appears in the same inbox as Messenger and WhatsApp enquiries.

Use this URL in:

- Facebook Page action buttons and posts
- Facebook or Instagram ads
- QR codes
- WhatsApp catalog or status links
- any StepFresh landing page button

A separate external StepFresh page can also embed the form:

```html
<iframe
  src="https://agentsiraji-leadpilot.minhazsiraji.chatgpt.site/enquire"
  title="Order StepFresh"
  loading="lazy"
  style="width:100%;min-height:1050px;border:0"
></iframe>
```

## 2. Any client's Facebook Page or website

LeadPilot provides a business-profile-driven hosted form at:

`https://YOUR-LEADPILOT-SITE/lead-form`

The form uses the configured business name, services, service areas and currency. It can be linked from any Facebook Page or embedded into any website without exposing an API secret.

### Facebook Page link

Set the Page action button or post link to:

`https://YOUR-LEADPILOT-SITE/lead-form?source=Client%20Facebook%20Page`

### Website iframe

```html
<iframe
  src="https://YOUR-LEADPILOT-SITE/lead-form?source=Client%20Website"
  title="Contact us"
  loading="lazy"
  style="width:100%;min-height:900px;border:0"
></iframe>
```

The `source` query value is stored in LeadPilot, so the owner can see where each lead came from.

## 3. Connect an existing custom website form

Websites with their own backend can send leads to:

`POST https://YOUR-LEADPILOT-SITE/api/integrations/website-leads`

Configure these hosted secrets first:

- `WEBSITE_INGEST_KEY`: a long random secret used only by the website backend
- `WEBSITE_ALLOWED_ORIGINS`: comma-separated HTTPS origins, for example `https://client.com,https://www.client.com`

Example server-side request:

```js
const response = await fetch(
  "https://YOUR-LEADPILOT-SITE/api/integrations/website-leads",
  {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.LEADPILOT_INGEST_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      customerName: "Ayesha Rahman",
      email: "ayesha@example.com",
      phone: "+8801712345678",
      service: "Website development",
      location: "Dhaka",
      expectedValue: 50000,
      message: "I need a five-page business website.",
      sourceName: "Client contact page",
      pageUrl: "https://client.com/contact",
    }),
  },
);

if (!response.ok) throw new Error("LeadPilot rejected the lead");
```

Supported aliases include `name` or `fullName`, `mobile` or `tel`, `product` or `interest`, `city` or `address`, and `comments` or `details`.

## Security rules

- Never put `WEBSITE_INGEST_KEY` in browser JavaScript, HTML, GitHub or screenshots.
- Use the hosted form or iframe when a website has no backend.
- Use the secure API only from a server, serverless function, WordPress plugin, Shopify app proxy or other protected backend.
- Keep `WEBSITE_ALLOWED_ORIGINS` restricted to the client's real HTTPS domains.
- The public forms include a honeypot, field limits and duplicate protection.
- Replies still require owner approval.

## Current client model

LeadPilot is currently a single-business workspace. For a paying client, deploy a separate LeadPilot instance and configure that client's profile, Facebook Page, WhatsApp account, website key and allowed domains. This keeps client data and secrets isolated. A shared multi-tenant AgentSiraji control panel is a later product phase.

## Deployment smoke test

1. Submit one StepFresh order through `/enquire` and confirm source `StepFresh landing page`.
2. Submit one enquiry through `/lead-form?source=Test%20Website`.
3. Confirm both create owner notifications and separate lead rows.
4. Call the secure API with the wrong key and confirm HTTP 401.
5. Call from a disallowed browser origin and confirm HTTP 403.
6. Call with the valid server key and confirm HTTP 201.
7. Confirm Messenger and WhatsApp still create and update leads normally.
