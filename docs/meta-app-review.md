# Meta Messenger App Review Package

This document is the working submission package for the StepFresh pilot of AgentSiraji LeadPilot.

## 1. Permission scope

Request the minimum permission required for the current product:

- `pages_messaging` — receive customer messages sent to the connected StepFresh Facebook Page and send an owner-approved reply in the same conversation.

Do not request these optional permissions unless the implementation later uses them and the review explanation is updated:

- `pages_show_list`
- `pages_read_engagement`
- `pages_utility_messaging`
- `pages_manage_metadata`
- `business_management`

The current webhook and Page subscription are configured manually in Meta. LeadPilot does not need broad Page-management, engagement-reading, marketing, advertising, or business-management access for the pilot.

## 2. Permission-use explanation for Meta

Paste and adapt this text in the `pages_messaging` review field:

> AgentSiraji LeadPilot is a human-in-the-loop lead and order-management tool used by the StepFresh Facebook Page. When a person sends a Messenger message to StepFresh, the app receives the message through Meta Webhooks, creates or updates the linked customer lead, extracts only the order and delivery details supplied by the customer, and prepares a reply draft for the StepFresh owner. The app does not send bulk messages, scrape profiles, initiate cold outreach, or make autonomous fulfilment decisions. A business response requires owner review and approval. The permission is used only for one-to-one customer service and order conversations initiated by the customer or continued within Meta's allowed messaging window.

## 3. Reviewer test message

Use this exact test order from a Messenger account that is allowed to interact with the review app:

```text
I want to order 2 bottles of StepFresh.
Name: Meta Reviewer
Address: Savar, Dhaka
Phone: 01400000000
Cash on delivery is okay.
```

Expected result:

1. Meta sends the message event to `/api/webhooks/facebook`.
2. LeadPilot creates a new Facebook Messenger lead.
3. The lead shows `2 bottles — ৳800`, the supplied location and phone number, and the original message.
4. LeadPilot prepares a reply draft for human review.
5. The StepFresh owner reviews the draft before any business reply is sent or recorded.
6. A later ordinary reply stays attached to the active order. A genuine new order after a terminal status creates a separate order lead.

## 4. Reviewer instructions

Use this text in the review instructions field after reviewer access has been prepared:

> 1. Open the StepFresh Facebook Page and send the test order shown in the submission notes.
> 2. Open the supplied LeadPilot reviewer URL and sign in with the temporary review credentials provided in the submission.
> 3. Select **Leads**, then open the newest lead with source **Facebook Messenger**.
> 4. Confirm that the original Messenger text, extracted package, order value, contact details, score explanation and owner-review draft are visible.
> 5. Edit the draft if desired and use the owner-approval action. The application does not bulk message users and does not send an unreviewed automated response.
> 6. Send a second message in the same Messenger conversation and refresh the lead to confirm that the customer reply is recorded in the activity history.

## 5. Required reviewer-access work before submission

Do not submit App Review until one of these secure access methods is available:

- Preferred: a temporary, restricted reviewer-access flow protected by a short-lived server-side secret and limited to the StepFresh review workspace.
- Alternative: a dedicated test owner account that Meta reviewers can use without access to the real owner's personal ChatGPT account.

The review method must not expose the normal owner session, Page access token, App Secret, WhatsApp token, D1 credentials, or customer data unrelated to the review test.

## 6. Screen-recording script

Record one continuous video with no cuts that hide authentication or the data flow:

1. Show the app name and the connected StepFresh Page in Meta for Developers.
2. Show that the Page is subscribed to the `messages` webhook field.
3. Open Messenger and send the reviewer test order to StepFresh.
4. Open the LeadPilot reviewer/owner dashboard.
5. Refresh once and show the new Facebook Messenger lead.
6. Open the lead and show the original message, extracted facts, package/value, transparent score and reply draft.
7. Demonstrate that the response requires human approval.
8. Send a customer follow-up and show it appearing in the lead activity history.
9. Open `/privacy` and `/data-deletion` to show the public privacy and deletion instructions.

Do not expose access tokens, App Secret values, verification tokens, passwords, browser password-manager popups or unrelated customer records in the recording.

## 7. Public URLs after the next deployment

- App: `https://agentsiraji-leadpilot.minhazsiraji.chatgpt.site/`
- Privacy notice: `https://agentsiraji-leadpilot.minhazsiraji.chatgpt.site/privacy`
- Data deletion instructions: `https://agentsiraji-leadpilot.minhazsiraji.chatgpt.site/data-deletion`
- Messenger webhook: `https://agentsiraji-leadpilot.minhazsiraji.chatgpt.site/api/webhooks/facebook`

The `/data-deletion` URL will become available only after this branch is merged and the Site is updated.

## 8. Data handling summary

LeadPilot stores only the data needed to manage the conversation and order: Messenger sender identifier, available display name, message text, details the customer voluntarily supplies, lead analysis, draft replies, workflow status, follow-up tasks, notifications and activity history.

Customers can request deletion by messaging the StepFresh Page with `delete my data`. The owner can permanently delete the linked LeadPilot record. Customers can request `do not contact me` to stop future follow-ups.

## 9. Pre-submission checklist

- [ ] Business verification requirements shown by Meta are completed or confirmed not required for the current submission stage.
- [ ] App icon, category, contact email, privacy URL and data-deletion URL are configured in App Settings.
- [ ] App domains and public Site URL are correct.
- [ ] `pages_messaging` is the only permission requested unless another permission is demonstrably required.
- [ ] Reviewer access works in a clean/private browser session.
- [ ] Reviewer can create a fresh test lead without seeing unrelated customer data.
- [ ] Screen recording matches the written steps.
- [ ] Messenger webhook signature verification remains enabled.
- [ ] Page access token and App Secret remain server-side.
- [ ] Public privacy and deletion pages load without owner sign-in.
- [ ] Messenger repeat-order regression and ordinary-reply behaviour pass after deployment.
- [ ] WhatsApp remains connected and unchanged.

## 10. Manual actions that Minhaz must complete

These actions require the Meta account owner and cannot be completed through GitHub:

1. Complete any Meta business-verification or identity prompts.
2. Confirm the final permission selection in the Meta dashboard.
3. Provide or approve temporary reviewer access.
4. Record and upload the review screencast.
5. Submit the App Review request and respond to reviewer questions.

Do not submit until the latest GitHub `main` branch is deployed and the full Messenger smoke test passes.
