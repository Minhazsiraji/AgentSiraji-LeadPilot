export type CsvLeadRow = { customerName: string; email: string; phone: string; message: string; source: string };

export function parseLeadCsv(input: string): { rows: CsvLeadRow[]; errors: string[] } {
  const lines = parseRows(input);
  if (!lines.length) return { rows: [], errors: ["The CSV file is empty."] };
  const headers = lines[0].map((value) => value.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const index = (aliases: string[]) => aliases.map((name) => headers.indexOf(name)).find((value) => value >= 0) ?? -1;
  const nameIndex = index(["customer_name", "name", "customer"]);
  const emailIndex = index(["email", "email_address"]);
  const phoneIndex = index(["phone", "telephone", "mobile"]);
  const messageIndex = index(["message", "enquiry", "original_message"]);
  const sourceIndex = index(["source", "lead_source"]);
  if (nameIndex < 0 || messageIndex < 0) return { rows: [], errors: ["CSV must contain customer_name (or name) and message columns."] };

  const rows: CsvLeadRow[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((columns, offset) => {
    const line = offset + 2;
    const customerName = columns[nameIndex]?.trim() ?? "";
    const message = columns[messageIndex]?.trim() ?? "";
    const email = emailIndex >= 0 ? columns[emailIndex]?.trim() ?? "" : "";
    const phone = phoneIndex >= 0 ? columns[phoneIndex]?.trim() ?? "" : "";
    if (!customerName || !message) {
      errors.push(`Row ${line}: customer name and message are required.`);
      return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      errors.push(`Row ${line}: email address is invalid.`);
      return;
    }
    rows.push({ customerName, email, phone, message, source: sourceIndex >= 0 ? columns[sourceIndex]?.trim() || "CSV import" : "CSV import" });
  });
  return { rows: rows.slice(0, 250), errors };
}

function parseRows(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"' && quoted && input[index + 1] === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(value); value = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }
    value += char;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}
