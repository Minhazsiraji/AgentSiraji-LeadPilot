import { apiError, requireOwner } from "../../../../lib/api-auth";
import { createLead } from "../../../../lib/data";
import { parseLeadCsv } from "../../../../lib/csv";

export async function POST(request: Request) {
  try {
    const auth = await requireOwner(request);
    if ("response" in auth) return auth.response;
    const payload = (await request.json()) as { csvText?: unknown };
    const csvText = typeof payload.csvText === "string" ? payload.csvText.slice(0, 1_000_000) : "";
    const parsed = parseLeadCsv(csvText);
    if (!parsed.rows.length) return Response.json({ error: parsed.errors[0] ?? "No valid leads were found.", errors: parsed.errors }, { status: 400 });
    let created = 0;
    let duplicates = 0;
    for (const row of parsed.rows) {
      const result = await createLead({ customerName: row.customerName, email: row.email, phone: row.phone, message: row.message, source: row.source }, auth.user.email);
      if (result.duplicate) duplicates += 1; else created += 1;
    }
    return Response.json({ created, duplicates, errors: parsed.errors });
  } catch (error) {
    return apiError(error);
  }
}
