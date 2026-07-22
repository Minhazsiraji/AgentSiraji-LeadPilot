import { apiError } from "../../../../lib/api-auth";
import { createLead } from "../../../../lib/data";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    if (typeof payload.companyWebsite === "string" && payload.companyWebsite.trim()) {
      return Response.json({ ok: true }, { status: 202 });
    }
    const customerName = typeof payload.customerName === "string" ? payload.customerName.trim().slice(0, 120) : "";
    const email = typeof payload.email === "string" ? payload.email.trim().slice(0, 180) : "";
    const phone = typeof payload.phone === "string" ? payload.phone.trim().slice(0, 60) : "";
    const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 5000) : "";
    if (!customerName || !message || (!email && !phone)) {
      return Response.json({ error: "Name, message, and either email or phone are required." }, { status: 400 });
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const result = await createLead({ customerName, email, phone, message, source: "Website enquiry" }, "Public form");
    return Response.json({ ok: true, duplicate: result.duplicate, message: result.duplicate ? "We already received this enquiry and will follow it up." : "Your enquiry has been received." }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
