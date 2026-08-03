export function buildMessengerSendRequest(input: {
  pageId: string;
  senderId: string;
  message: string;
  pageAccessToken: string;
  appSecretProof: string;
  graphVersion?: string;
}) {
  const version = input.graphVersion?.trim() || "v26.0";
  const url = new URL(
    `https://graph.facebook.com/${version}/${encodeURIComponent(input.pageId)}/messages`,
  );
  url.searchParams.set("access_token", input.pageAccessToken);
  url.searchParams.set("appsecret_proof", input.appSecretProof);
  return {
    url,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: input.senderId },
      messaging_type: "RESPONSE",
      message: { text: input.message.slice(0, 2_000) },
    }),
  };
}
