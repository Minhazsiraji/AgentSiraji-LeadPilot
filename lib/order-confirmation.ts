type OrderConfirmationInput = {
  businessName: string;
  currency: string;
  customerName: string;
  expectedValue: number;
  location: string | null;
  originalMessage: string;
  phone: string | null;
  serviceRequested: string | null;
};

export function buildOrderConfirmationMessage(input: OrderConfirmationInput) {
  const address = extractField(input.originalMessage, "Delivery address");
  const orderLabel = input.serviceRequested?.split(/\s+—\s+/)[0]?.trim() || "StepFresh order";
  const amount = formatAmount(input.expectedValue, input.currency);

  return [
    `প্রিয় ${input.customerName},`,
    "",
    `আপনার ${input.businessName} অর্ডারটি নিশ্চিত করা হয়েছে ✅`,
    "",
    `অর্ডার: ${orderLabel}`,
    `মোট: ${amount}`,
    input.phone ? `ফোন: ${input.phone}` : "",
    input.location ? `ডেলিভারি এলাকা: ${input.location}` : "",
    address ? `ঠিকানা: ${address}` : "",
    "পেমেন্ট: ক্যাশ অন ডেলিভারি",
    "",
    "পণ্য কুরিয়ারে দেওয়ার পর আমরা আপনাকে জানাব।",
    "",
    "ধন্যবাদ,",
    input.businessName,
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n");
}

export function whatsappMessageUrl(phone: string | null, message: string) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function extractField(message: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message.match(new RegExp(`${escaped}:\\s*(.+?)(?:\\.\\s+[A-Z][\\w/ ]+:|$)`, "i"))?.[1]?.trim() ?? "";
}

function formatAmount(value: number, currency: string) {
  const rounded = Math.max(0, Math.round(value)).toLocaleString("en-US");
  return currency.toUpperCase() === "BDT" ? `৳${rounded}` : `${currency.toUpperCase()} ${rounded}`;
}
