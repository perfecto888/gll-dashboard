import { createClient, Client } from "@libsql/client";

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

export function getDb(): Client {
  if (!client) {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getDb().batch(
      [
        `CREATE TABLE IF NOT EXISTS purchase_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_number TEXT,
          order_date TEXT,
          customer_name TEXT,
          email TEXT,
          phone TEXT,
          address TEXT,
          city TEXT,
          state TEXT,
          zip TEXT,
          shipping_cost REAL,
          subtotal REAL,
          total REAL,
          source TEXT NOT NULL DEFAULT 'csv',
          batch_id TEXT,
          menu TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
          product TEXT NOT NULL,
          quantity REAL DEFAULT 1,
          unit_price REAL,
          total REAL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_items_product ON order_items(product)`,
        `CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(order_date)`,
        `CREATE INDEX IF NOT EXISTS idx_po_customer ON purchase_orders(customer_name)`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(order_number)
           WHERE order_number IS NOT NULL`,
        `CREATE TABLE IF NOT EXISTS excluded_orders (order_number TEXT PRIMARY KEY, reason TEXT)`,
      ],
      "write"
    ).then(() => undefined);
  }
  return schemaReady;
}

export interface OrderHeader {
  order_number: string | null;
  order_date: string | null;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  shipping_cost: number | null;
  subtotal: number | null;
  total: number | null;
  source: "csv" | "screenshot";
  batch_id: string;
}

export interface OrderItem {
  product: string;
  quantity: number;
  unit_price: number | null;
  total: number | null;
}

/** Merge known product-name variants so analytics count them as one item. */
export function normalizeProduct(name: string): string {
  const n = name.trim();
  if (/bacteriostatic/i.test(n)) return "Bacteriostatic Water (30ml)";
  return n;
}

/** Public carrier tracking-page URL for a tracking number. */
export function trackingUrl(carrier: string | null, tracking: string | null): string | null {
  if (!tracking) return null;
  const c = (carrier ?? "").toUpperCase();
  if (c.includes("UPS")) return `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(tracking)}`;
  if (c.includes("FEDEX")) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
  if (c.includes("USPS")) return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tracking)}`;
  if (c.includes("DHL")) return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(tracking)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${carrier ?? ""} tracking ${tracking}`)}`;
}

/** Set shipping info on an existing order (from a "your order has shipped" email). Returns true if the order existed. */
export async function setTracking(orderNumber: string, carrier: string | null, tracking: string | null): Promise<boolean> {
  await ensureSchema();
  const r = await getDb().execute({
    sql: `UPDATE purchase_orders SET carrier = ?, tracking_number = ? WHERE order_number = ?`,
    args: [carrier, tracking, orderNumber],
  });
  return r.rowsAffected > 0;
}

/** Insert one order + items. If order_number already exists it is replaced. */
export async function insertOrder(header: OrderHeader, items: OrderItem[]): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const tx = await db.transaction("write");
  try {
    let menu: string | null = null;
    let carrier: string | null = null;
    let tracking_number: string | null = null;
    if (header.order_number) {
      // preserve the menu tag (weekly Excel sync) and tracking info (shipped emails) across replaces
      const prev = await tx.execute({
        sql: `SELECT menu, carrier, tracking_number FROM purchase_orders WHERE order_number = ?`,
        args: [header.order_number],
      });
      menu = (prev.rows[0]?.menu as string | null) ?? null;
      carrier = (prev.rows[0]?.carrier as string | null) ?? null;
      tracking_number = (prev.rows[0]?.tracking_number as string | null) ?? null;
      await tx.execute({
        sql: `DELETE FROM order_items WHERE order_id IN (SELECT id FROM purchase_orders WHERE order_number = ?)`,
        args: [header.order_number],
      });
      await tx.execute({
        sql: `DELETE FROM purchase_orders WHERE order_number = ?`,
        args: [header.order_number],
      });
    }
    const r = await tx.execute({
      sql: `INSERT INTO purchase_orders
            (order_number, order_date, customer_name, email, phone, address, city, state, zip,
             shipping_cost, subtotal, total, source, batch_id, menu, carrier, tracking_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        header.order_number, header.order_date, header.customer_name, header.email,
        header.phone, header.address, header.city, header.state, header.zip,
        header.shipping_cost, header.subtotal, header.total, header.source, header.batch_id, menu,
        carrier, tracking_number,
      ],
    });
    const orderId = Number(r.lastInsertRowid);
    for (const it of items) {
      await tx.execute({
        sql: `INSERT INTO order_items (order_id, product, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)`,
        args: [orderId, normalizeProduct(it.product), it.quantity, it.unit_price, it.total],
      });
    }
    await tx.commit();
    return orderId;
  } catch (e) {
    tx.close();
    throw e;
  }
}
