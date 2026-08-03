export function buildWhatsAppSendRequest(input: {
  phoneNumberId: string;
  waId: string;
  message: string;
  accessToken: string;
  graphVersion?: string;
}) {
  const version = input.graphVersion?.trim() || "v26.0";
  const url = new URL(
    `https://graph.facebook.com/${version}/${encodeURIComponent(input.phoneNumberId)}/messages`,
  );
  return {
    url,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.waId,
      type: "text",
      text: {
        preview_url: false,
        body: input.message.slice(0, 4_096),
      },
    }),
  };
}
