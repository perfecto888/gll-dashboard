// One-time copy of local SQLite data → Turso.
import Database from "better-sqlite3";
import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const local = new Database(path.join(ROOT, "data", "dashboard.db"), { readonly: true });
const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// schema
await turso.batch([
  `CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT, order_date TEXT,
    customer_name TEXT, email TEXT, phone TEXT, address TEXT, city TEXT, state TEXT, zip TEXT,
    shipping_cost REAL, subtotal REAL, total REAL, source TEXT NOT NULL DEFAULT 'csv',
    batch_id TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product TEXT NOT NULL, quantity REAL DEFAULT 1, unit_price REAL, total REAL)`,
  `CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product)`,
  `CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(order_date)`,
  `CREATE INDEX IF NOT EXISTS idx_po_customer ON purchase_orders(customer_name)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(order_number) WHERE order_number IS NOT NULL`,
], "write");

// wipe target so this script is re-runnable
await turso.batch([`DELETE FROM order_items`, `DELETE FROM purchase_orders`], "write");

const orders = local.prepare(`SELECT * FROM purchase_orders ORDER BY id`).all();
const items = local.prepare(`SELECT * FROM order_items ORDER BY id`).all();

// keep original IDs so item FKs stay valid
const stmts = [];
for (const o of orders) {
  stmts.push({
    sql: `INSERT INTO purchase_orders (id, order_number, order_date, customer_name, email, phone, address, city, state, zip, shipping_cost, subtotal, total, source, batch_id, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [o.id, o.order_number, o.order_date, o.customer_name, o.email, o.phone, o.address, o.city, o.state, o.zip, o.shipping_cost, o.subtotal, o.total, o.source, o.batch_id, o.created_at],
  });
}
for (const it of items) {
  stmts.push({
    sql: `INSERT INTO order_items (id, order_id, product, quantity, unit_price, total) VALUES (?,?,?,?,?,?)`,
    args: [it.id, it.order_id, it.product, it.quantity, it.unit_price, it.total],
  });
}

// batch in chunks of 200
for (let i = 0; i < stmts.length; i += 200) {
  await turso.batch(stmts.slice(i, i + 200), "write");
  process.stdout.write(`\r${Math.min(i + 200, stmts.length)}/${stmts.length}`);
}
console.log();

const check = await turso.execute(`SELECT (SELECT COUNT(*) FROM purchase_orders) po, (SELECT COUNT(*) FROM order_items) oi`);
console.log("Turso now has:", check.rows[0]);
