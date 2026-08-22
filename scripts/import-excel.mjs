// One-time import of "GLL - Peptide Sales" workbook.
// Merges all sheets, dedupes by Order #, parses multiline addresses.
// Usage: node scripts/import-excel.mjs "/path/to/GLL - Peptide Sales (1).xlsx"
import XLSX from "xlsx";
import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";

const file = process.argv[2];
if (!file) { console.error("Pass the xlsx path"); process.exit(1); }

const db = new Database(path.join(process.cwd(), "data", "dashboard.db"));
const wb = XLSX.readFile(file);

function excelDate(v) {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

// "2250 Thornton Taylor Pkwy\r\nSuite C\r\nFayetteville, TN 37334"
function parseAddress(raw) {
  if (!raw) return { address: null, city: null, state: null, zip: null };
  const lines = String(raw).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { address: null, city: null, state: null, zip: null };
  const last = lines[lines.length - 1];
  const m = last.match(/^(.*?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (m) {
    return {
      address: lines.slice(0, -1).join(", ") || null,
      city: m[1].replace(/,$/, "").trim() || null,
      state: m[2].toUpperCase(),
      zip: m[3],
    };
  }
  return { address: lines.join(", "), city: null, state: null, zip: null };
}

function filledCount(o) {
  return Object.values(o).filter((v) => v != null && v !== "").length;
}

const byOrder = new Map();   // GL# → best row
const noNumber = new Map();  // fingerprint → row (rows without a valid GL#)
let rawRows = 0;

for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
  for (const r of rows) {
    const orderNum = String(r["Order #"] ?? "").trim();
    const total = num(r["Total"]) ?? num(r["Total Amount"]);
    const practice = String(r["Practice Name"] ?? "").trim();
    if (!total && !practice) continue; // summary/blank rows
    rawRows++;
    const addr = parseAddress(r["Address"]);
    const rec = {
      order_number: /^GL\d+$/i.test(orderNum) ? orderNum.toUpperCase() : null,
      order_date: excelDate(r["Date"]),
      customer_name: practice || [r["First Name"], r["Last Name"]].filter(Boolean).join(" ").trim() || null,
      email: String(r["Email"] ?? "").trim() || null,
      phone: String(r["Phone"] ?? "").trim() || null,
      ...addr,
      shipping_cost: num(r["Shipping Cost"]),
      subtotal: num(r["Total Amount"]),
      total: num(r["Total"]) ?? num(r["Total Amount"]),
    };
    if (rec.order_number) {
      const prev = byOrder.get(rec.order_number);
      if (!prev || filledCount(rec) > filledCount(prev)) byOrder.set(rec.order_number, rec);
    } else {
      const fp = `${rec.customer_name}|${rec.total}|${rec.order_date}`;
      if (!noNumber.has(fp)) noNumber.set(fp, rec);
    }
  }
}

const batch = crypto.randomUUID();
const insertPO = db.prepare(`
  INSERT INTO purchase_orders
  (order_number, order_date, customer_name, email, phone, address, city, state, zip,
   shipping_cost, subtotal, total, source, batch_id)
  VALUES (@order_number, @order_date, @customer_name, @email, @phone, @address, @city, @state, @zip,
          @shipping_cost, @subtotal, @total, 'csv', @batch_id)
`);
const exists = db.prepare(`SELECT id FROM purchase_orders WHERE order_number = ?`);

let inserted = 0, skippedExisting = 0;
const tx = db.transaction(() => {
  for (const rec of byOrder.values()) {
    if (exists.get(rec.order_number)) { skippedExisting++; continue; }
    insertPO.run({ ...rec, batch_id: batch });
    inserted++;
  }
  for (const rec of noNumber.values()) {
    insertPO.run({ ...rec, batch_id: batch });
    inserted++;
  }
});
tx();

console.log(JSON.stringify({
  rawRows,
  uniqueByOrderNumber: byOrder.size,
  withoutOrderNumber: noNumber.size,
  inserted,
  skippedExisting,
  batch,
}, null, 2));
