import { deliverApprovedReply as deliverFacebookReply } from "./facebook-messenger";
import { deliverWhatsAppReply, hasWhatsAppContact } from "./whatsapp-messenger";

export type ReplyDeliveryResult =
  | { channel: "recorded"; messageId: null }
  | { channel: "facebook"; messageId: string | null }
  | { channel: "whatsapp"; messageId: string | null };

export async function deliverApprovedReply(
  leadId: string,
  leadSource: string,
  message: string,
  lastCustomerActivityAt: string | null,
): Promise<ReplyDeliveryResult> {
  if (leadSource === "WhatsApp" || await hasWhatsAppContact(leadId)) {
    return deliverWhatsAppReply(leadId, message, lastCustomerActivityAt);
  }
  if (leadSource === "Facebook Messenger") {
    return deliverFacebookReply(leadId, leadSource, message, lastCustomerActivityAt);
  }
  return { channel: "recorded", messageId: null };
}
