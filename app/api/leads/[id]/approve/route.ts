import { apiError, requireOwner } from "../../../../../lib/api-auth";
import { approveDraft, getApprovableDraft } from "../../../../../lib/data";
import { deliverApprovedReply } from "../../../../../lib/reply-delivery";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const payload = (await request.json()) as { message?: unknown };
    const message = typeof payload.message === "string" ? payload.message.slice(0, 5000) : "";
    const approvable = await getApprovableDraft(id);
    if (!approvable) {
      return Response.json({ error: "This draft cannot be approved." }, { status: 409 });
    }
    const approvedMessage = message.trim() || approvable.draft[0].message;
    const delivery = await deliverApprovedReply(
      id,
      approvable.lead[0].source,
      approvedMessage,
      approvable.lead[0].lastCustomerActivityAt,
    );
    const approved = await approveDraft(id, message, auth.user.email);
    return approved
      ? Response.json({ ok: true, delivery: delivery.channel })
      : Response.json({ error: "This draft cannot be approved." }, { status: 409 });
  } catch (error) {
    if (error instanceof Error && error.message === "FACEBOOK_SEND_FAILED") {
      return Response.json({
        error: "Messenger could not send this reply. Nothing was marked as sent; try again.",
      }, { status: 502 });
    }
    if (error instanceof Error && [
      "FACEBOOK_CONTACT_NOT_FOUND",
      "FACEBOOK_INTEGRATION_NOT_CONFIGURED",
    ].includes(error.message)) {
      return Response.json({
        error: "This Messenger contact is not connected correctly. Reopen Facebook setup before sending.",
      }, { status: 409 });
    }
    if (error instanceof Error && error.message === "FACEBOOK_REPLY_WINDOW_CLOSED") {
      return Response.json({
        error: "Meta’s 24-hour Messenger reply window has closed. Nothing was marked as sent; contact the customer through an allowed channel.",
      }, { status: 409 });
    }
    if (error instanceof Error && error.message === "WHATSAPP_SEND_FAILED") {
      return Response.json({
        error: "WhatsApp could not send this reply. Nothing was marked as sent; try again.",
      }, { status: 502 });
    }
    if (error instanceof Error && error.message === "WHATSAPP_ACCESS_TOKEN_EXPIRED") {
      return Response.json({
        error: "Meta rejected the temporary WhatsApp access token. Open WhatsApp setup, paste the current temporary token from Meta API Setup, then try again. Nothing was marked as sent.",
      }, { status: 409 });
    }
    if (error instanceof Error && [
      "WHATSAPP_CONTACT_NOT_FOUND",
      "WHATSAPP_INTEGRATION_NOT_CONFIGURED",
    ].includes(error.message)) {
      return Response.json({
        error: "This WhatsApp contact is not connected correctly. Reopen WhatsApp setup before sending.",
      }, { status: 409 });
    }
    if (error instanceof Error && error.message === "WHATSAPP_REPLY_WINDOW_CLOSED") {
      return Response.json({
        error: "WhatsApp’s 24-hour customer-service window has closed. Nothing was marked as sent; use an approved template or wait for the customer to message again.",
      }, { status: 409 });
    }
    return apiError(error);
  }
}
