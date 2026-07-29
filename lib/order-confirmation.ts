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

export type CustomerOrderMessageStatus = "Order Confirmed" | "Shipped" | "Delivered" | "Cancelled";

export function buildOrderConfirmationMessage(input: OrderConfirmationInput) {
  return buildCustomerOrderStatusMessage(input, "Order Confirmed");
}

export function buildCustomerOrderStatusMessage(
  input: OrderConfirmationInput,
  status: CustomerOrderMessageStatus,
) {
  const address = extractField(input.originalMessage, "Delivery address");
  const orderLabel = input.serviceRequested?.split(/\s+—\s+/)[0]?.trim() || "StepFresh order";
  const amount = formatAmount(input.expectedValue, input.currency);
  const { headline, closing } = statusCopy(status, input.businessName);

  return [
    `প্রিয় ${input.customerName},`,
    "",
    headline,
    "",
    `অর্ডার: ${orderLabel}`,
    `মোট: ${amount}`,
    input.phone ? `ফোন: ${input.phone}` : "",
    input.location ? `ডেলিভারি এলাকা: ${input.location}` : "",
    address ? `ঠিকানা: ${address}` : "",
    "পেমেন্ট: ক্যাশ অন ডেলিভারি",
    "",
    closing,
    "",
    "ধন্যবাদ,",
    input.businessName,
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n");
}

export function customerOrderDraftType(status: CustomerOrderMessageStatus) {
  if (status === "Order Confirmed") return "order_confirmation";
  return `order_status_${status.toLowerCase()}`;
}

export function customerOrderMessageTitle(draftType: string) {
  if (draftType === "order_confirmation") return "Order confirmation";
  if (draftType === "order_status_shipped") return "Shipping update";
  if (draftType === "order_status_delivered") return "Delivery confirmation";
  if (draftType === "order_status_cancelled") return "Cancellation notice";
  return "Customer message";
}

export function isCustomerOrderDraft(draftType: string) {
  return draftType === "order_confirmation" || draftType.startsWith("order_status_");
}

export function whatsappMessageUrl(phone: string | null, message: string) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function statusCopy(status: CustomerOrderMessageStatus, businessName: string) {
  if (status === "Shipped") {
    return {
      headline: `আপনার ${businessName} অর্ডারটি কুরিয়ারে দেওয়া হয়েছে 🚚`,
      closing: "ডেলিভারি আপডেটের জন্য আপনার ফোনটি চালু রাখুন।",
    };
  }
  if (status === "Delivered") {
    return {
      headline: `আপনার ${businessName} অর্ডারটির ডেলিভারি সম্পন্ন হয়েছে ✅`,
      closing: "আমাদের সাথে থাকার জন্য ধন্যবাদ। কোনো সমস্যা থাকলে আমাদের জানান।",
    };
  }
  if (status === "Cancelled") {
    return {
      headline: `আপনার ${businessName} অর্ডারটি বাতিল করা হয়েছে।`,
      closing: "এটি ভুল হয়ে থাকলে বা আবার অর্ডার করতে চাইলে আমাদের জানান।",
    };
  }
  return {
    headline: `আপনার ${businessName} অর্ডারটি নিশ্চিত করা হয়েছে ✅`,
    closing: "পণ্য কুরিয়ারে দেওয়ার পর আমরা আপনাকে জানাব।",
  };
}

function extractField(message: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message.match(new RegExp(`${escaped}:\\s*(.+?)(?:\\.\\s+[A-Z][\\w/ ]+:|$)`, "i"))?.[1]?.trim() ?? "";
}

function formatAmount(value: number, currency: string) {
  const rounded = Math.max(0, Math.round(value)).toLocaleString("en-US");
  return currency.toUpperCase() === "BDT" ? `৳${rounded}` : `${currency.toUpperCase()} ${rounded}`;
}
