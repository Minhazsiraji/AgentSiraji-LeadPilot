import bangladeshThanas from "./bangladesh-thanas.json";

export const BANGLADESH_DISTRICTS = [
  "Bagerhat", "Bandarban", "Barguna", "Barishal", "Bhola", "Bogura", "Brahmanbaria", "Chandpur",
  "Chapainawabganj", "Chattogram", "Chuadanga", "Cox's Bazar", "Cumilla", "Dhaka", "Dinajpur",
  "Faridpur", "Feni", "Gaibandha", "Gazipur", "Gopalganj", "Habiganj", "Jamalpur", "Jashore",
  "Jhalokathi", "Jhenaidah", "Joypurhat", "Khagrachhari", "Khulna", "Kishoreganj", "Kurigram",
  "Kushtia", "Lakshmipur", "Lalmonirhat", "Madaripur", "Magura", "Manikganj", "Meherpur",
  "Moulvibazar", "Munshiganj", "Mymensingh", "Naogaon", "Narail", "Narayanganj", "Narsingdi",
  "Natore", "Netrokona", "Nilphamari", "Noakhali", "Pabna", "Panchagarh", "Patuakhali",
  "Pirojpur", "Rajbari", "Rajshahi", "Rangamati", "Rangpur", "Satkhira", "Shariatpur",
  "Sherpur", "Sirajganj", "Sunamganj", "Sylhet", "Tangail", "Thakurgaon",
] as const;

export type PublicOrder = {
  customerName: string;
  phone: string;
  quantity: number;
  district: string;
  thana: string;
  address: string;
  note: string;
};

const DISTRICT_LOOKUP = new Map(BANGLADESH_DISTRICTS.map((district) => [district.toLowerCase(), district]));
const THANAS_BY_DISTRICT = bangladeshThanas as Record<string, string[]>;

export function getThanasForDistrict(district: string) {
  const canonicalDistrict = DISTRICT_LOOKUP.get(district.trim().toLowerCase());
  return canonicalDistrict ? THANAS_BY_DISTRICT[canonicalDistrict] ?? [] : [];
}

export function normalizeBangladeshPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^01[3-9]\d{8}$/.test(digits)) return `+880${digits.slice(1)}`;
  if (/^8801[3-9]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

export function validatePublicOrder(payload: Record<string, unknown>) {
  const customerName = text(payload.customerName, 120);
  const phone = normalizeBangladeshPhone(text(payload.phone, 30));
  const quantity = Number(payload.quantity);
  const districtInput = text(payload.district, 40);
  const district = DISTRICT_LOOKUP.get(districtInput.toLowerCase()) ?? "";
  const thana = text(payload.thana, 80);
  const address = text(payload.address, 300);
  const note = text(payload.note, 500);
  const codConfirmed = payload.codConfirmed === true || payload.codConfirmed === "on";
  const detailsConfirmed = payload.detailsConfirmed === true || payload.detailsConfirmed === "on";

  if (customerName.length < 2 || !/[\p{L}]/u.test(customerName)) return failure("Enter the customer's full name.");
  if (!phone) return failure("Enter a valid Bangladesh mobile number, for example 01712345678.");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return failure("Choose a quantity between 1 and 20.");
  if (!district) return failure("Choose a valid district.");
  const validThana = getThanasForDistrict(district).find((candidate) => candidate.toLowerCase() === thana.toLowerCase());
  if (!validThana) return failure("Choose a valid thana or upazila for the selected district.");
  if (address.length < 10 || !/[\p{L}\p{N}]/u.test(address)) return failure("Enter a complete delivery address of at least 10 characters.");
  if (!codConfirmed) return failure("Confirm that payment will be made by cash on delivery.");
  if (!detailsConfirmed) return failure("Confirm that the phone number and delivery details are correct.");

  return {
    ok: true as const,
    order: { customerName, phone, quantity, district, thana: validThana, address, note } satisfies PublicOrder,
  };
}

export function publicOrderMessage(order: PublicOrder) {
  return [
    `I want ${order.quantity} ${order.quantity === 1 ? "bottle" : "bottles"}.`,
    `District: ${order.district}.`,
    `Thana/Upazila: ${order.thana}.`,
    `Delivery address: ${order.address}.`,
    "Payment: Cash on delivery.",
    order.note ? `Customer note: ${order.note}.` : "",
  ].filter(Boolean).join(" ");
}

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";
}

function failure(error: string) {
  return { ok: false as const, error };
}
