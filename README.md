# AgentSiraji LeadPilot

LeadPilot is a configurable lead and order-management system for small businesses. It captures inbound enquiries, extracts qualification facts, calculates a deterministic score, prepares replies for human approval, and keeps follow-ups visible until the lead reaches a clear outcome.

The first real-business preset is StepFresh (`@stepfresh.bd`), a Bangladesh shoe-deodorizer brand. The business profile—not the AI engine—defines the offerings, areas, currency, tone, qualification fields, prohibited claims, and pipeline. This keeps the product reusable for AgentSiraji customers.

## Architecture

- TypeScript, React 19, Next 16 route conventions, Vinext, and Cloudflare Workers
- Cloudflare D1 with Drizzle schema and generated migrations
- ChatGPT sign-in for the single-owner workspace; anonymous public enquiry route
- Small deterministic workflow modules for validation, scoring, pipeline rules, duplicate protection, and stopping conditions
- Provider-neutral AI layer with Gemini structured output first, optional OpenAI support, and a safe no-key rules fallback

## Main modules

- `lib/lead-engine.ts`: normalisation, extraction fallback, scoring, temperature, first replies, and follow-ups
- `lib/openai.ts`: Gemini/OpenAI provider adapter with structured extraction, bounded retry, and rules fallback
- `lib/data.ts`: D1 persistence, audit history, workflow guards, approval, follow-up sequencing, settings, and deletion
- `lib/csv.ts`: quoted CSV parsing and row validation
- `app/api`: public capture and authenticated owner actions
- `app/leadpilot-app.tsx`: dashboard, lead detail, approval, import, settings, and analytics UI
- `app/enquire`: public enquiry experience
- `lib/facebook-webhook.ts`: signed Facebook Messenger webhook verification, retry deduplication, contact-to-lead linking, and fast background ingestion

## Safety controls

- Human approval before generated messages are recorded as contact
- Deterministic score calculation with visible breakdown
- No autonomous order confirmation, fulfilment, cancellation, or loss decision
- Duplicate submission protection
- Spam and Do Not Contact suppression
- Follow-ups stop on reply, terminal outcome, or contact restriction
- Business-controlled services, areas, tone, and prohibited claims
- Customer record deletion
- CSV row validation and 250-row import limit
- API keys remain server-side and are never returned to the browser
- Facebook webhook requests require Meta's SHA-256 signature; repeated delivery event IDs are processed only once
- Messenger replies attach to the existing lead and still require owner approval before any business response

## Facebook Messenger configuration

The callback endpoint is:

`https://agentsiraji-leadpilot.minhazsiraji.chatgpt.site/api/webhooks/facebook`

Configure these hosted runtime values before subscribing a Page:

- `FACEBOOK_VERIFY_TOKEN`
- `FACEBOOK_APP_SECRET`
- `FACEBOOK_PAGE_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ID`
- `FACEBOOK_GRAPH_API_VERSION` (optional; defaults to `v26.0`)

Never place Meta tokens or the app secret in source files, GitHub, screenshots, browser code, or `.openai/hosting.json`. The first integration stage receives Messenger text enquiries and prepares replies for human approval; it does not send automatic messages.

## Optional AI configuration

The app works without an API key. To enable Gemini for multilingual extraction and reply drafting, configure hosted secrets:

- `AI_PROVIDER=gemini`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; defaults to `gemini-2.5-flash`)

OpenAI remains available as an alternative:

- `AI_PROVIDER=openai`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; defaults to `gpt-5.6`)

Set `AI_PROVIDER=rules` to force the deterministic engine. Never place secrets in source files, browser code, GitHub, screenshots, or `.openai/hosting.json`.

Kimi is intentionally not wired yet. Its future adapter belongs behind the same provider interface after the API contract and model name are selected; adding it will not change lead scoring, safety rules, or the dashboard.

## Verification

```bash
npm run lint
npm test
```

The test suite covers clear Hot leads, vague enquiries, unsupported services, relative dates, missing budgets, duplicate normalisation, Do Not Contact, spam, safe reply constraints, follow-up tone, score thresholds, CSV validation, and rendered output.
