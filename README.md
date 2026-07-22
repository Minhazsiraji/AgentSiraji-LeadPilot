# AgentSiraji LeadPilot

LeadPilot is a controlled lead-management system for small businesses. It captures inbound enquiries, extracts qualification facts, calculates a deterministic score, prepares replies for human approval, and keeps follow-ups visible until the lead reaches a clear outcome.

The included portfolio workspace uses a fictional home-cleaning business, BrightHome Cleaning.

## Architecture

- TypeScript, React 19, Next 16 route conventions, Vinext, and Cloudflare Workers
- Cloudflare D1 with Drizzle schema and generated migrations
- ChatGPT sign-in for the single-owner workspace; anonymous public enquiry route
- Small deterministic workflow modules for validation, scoring, pipeline rules, duplicate protection, and stopping conditions
- Optional OpenAI Responses API adapter with Structured Outputs; the rules engine remains a safe no-key fallback

## Main modules

- `lib/lead-engine.ts`: normalisation, extraction fallback, scoring, temperature, first replies, and follow-ups
- `lib/openai.ts`: optional structured extraction and reply generation with bounded retry and fallback
- `lib/data.ts`: D1 persistence, audit history, workflow guards, approval, follow-up sequencing, settings, and deletion
- `lib/csv.ts`: quoted CSV parsing and row validation
- `app/api`: public capture and authenticated owner actions
- `app/leadpilot-app.tsx`: dashboard, lead detail, approval, import, settings, and analytics UI
- `app/enquire`: public enquiry experience

## Safety controls

- Human approval before generated messages are recorded as contact
- Deterministic score calculation with visible breakdown
- No autonomous Won or Lost decision
- Duplicate submission protection
- Spam and Do Not Contact suppression
- Follow-ups stop on reply, terminal outcome, or contact restriction
- Business-controlled services, areas, tone, and prohibited claims
- Customer record deletion
- CSV row validation and 250-row import limit
- AI calls are not stored by OpenAI (`store: false`)

## Optional OpenAI configuration

The app works without an API key by using the tested deterministic fallback. To enable structured AI extraction and drafting, configure hosted secrets:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional; defaults to `gpt-5.6`)

Never place secrets in source files or `.openai/hosting.json`.

## Verification

```bash
npm run lint
npm test
```

The test suite covers clear Hot leads, vague enquiries, unsupported services, relative dates, missing budgets, duplicate normalisation, Do Not Contact, spam, safe reply constraints, follow-up tone, score thresholds, CSV validation, and rendered output.
