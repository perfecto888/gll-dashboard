// Weekly menu-tag sync from the "GLL - Peptide Sales" workbook.
// Reads every sheet, maps Order # → Menu (GLL/Quantis/...), updates Turso.
// Also inserts any orders that exist in the sheet but not in the DB (header-only).
// Usage: node scripts/sync-menu.mjs "/path/to/GLL - Peptide Sales.xlsx"
import XLSX from "xlsx";
import { createClient } from "@libsql/client";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const file = process.argv[2];
if (!file) { console.error("Pass the xlsx path"); process.exit(1); }

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
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

// collect order # → {menu, date, name, email, total, shipping}
const sheetOrders = new Map();
for (const name of wb.SheetNames) {
  for (const r of XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" })) {
    const n = String(r["Order #"] ?? "").trim().toUpperCase();
    if (!/^GL\d+$/.test(n)) continue;
    const rec = {
      menu: String(r["Menu"] ?? "").trim() || null,
      order_date: excelDate(r["Date"]),
      customer_name: String(r["Practice Name"] ?? "").trim() ||
        [r["First Name"], r["Last Name"]].filter(Boolean).join(" ").trim() || null,
      email: String(r["Email"] ?? "").trim() || null,
      phone: String(r["Phone"] ?? "").trim() || null,
      shipping_cost: num(r["Shipping Cost"]),
      subtotal: num(r["Total Amount"]),
      total: num(r["Total"]) ?? num(r["Total Amount"]),
    };
    const prev = sheetOrders.get(n);
    if (!prev || (rec.menu && !prev.menu)) sheetOrders.set(n, { ...prev, ...rec });
  }
}

const existing = await db.execute(`SELECT order_number, menu FROM purchase_orders WHERE order_number IS NOT NULL`);
const dbMenus = new Map(existing.rows.map((r) => [r.order_number, r.menu]));

const updates = [];
const inserts = [];
const batch = crypto.randomUUID();
for (const [n, rec] of sheetOrders) {
  if (dbMenus.has(n)) {
    if (rec.menu && rec.menu !== dbMenus.get(n)) {
      updates.push({ sql: `UPDATE purchase_orders SET menu = ? WHERE order_number = ?`, args: [rec.menu, n] });
    }
  } else {
    inserts.push({
      sql: `INSERT INTO purchase_orders (order_number, order_date, customer_name, email, phone, shipping_cost, subtotal, total, menu, source, batch_id)
            VALUES (?,?,?,?,?,?,?,?,?,'csv',?)`,
      args: [n, rec.order_date, rec.customer_name, rec.email, rec.phone, rec.shipping_cost, rec.subtotal, rec.total, rec.menu, batch],
    });
  }
}

for (const group of [updates, inserts]) {
  for (let i = 0; i < group.length; i += 100) await db.batch(group.slice(i, i + 100), "write");
}

const counts = await db.execute(`SELECT COALESCE(menu,'(untagged)') menu, COUNT(*) c FROM purchase_orders GROUP BY menu ORDER BY c DESC`);
console.log(JSON.stringify({
  sheetOrders: sheetOrders.size,
  menuUpdates: updates.length,
  newOrdersInserted: inserts.length,
  menuBreakdown: counts.rows,
}, null, 2));
