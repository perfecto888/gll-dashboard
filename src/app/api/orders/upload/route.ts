import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { insertOrder, OrderItem } from "@/lib/db";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// header aliases → canonical field
const FIELD_MAP: Record<string, string> = {
  "order": "order_number", "order #": "order_number", "order number": "order_number",
  order_number: "order_number", "order id": "order_number",
  date: "order_date", "order date": "order_date", order_date: "order_date",
  created: "order_date", "created at": "order_date",
  customer: "customer_name", name: "customer_name", client: "customer_name",
  "customer name": "customer_name", clinic: "customer_name", recipient: "customer_name",
  email: "email", phone: "phone",
  address: "address", "street": "address", "address 1": "address",
  city: "city", state: "state", zip: "zip", "zip code": "zip", postcode: "zip",
  shipping: "shipping_cost", "shipping cost": "shipping_cost",
  subtotal: "subtotal", "order total": "total", "total due": "total",
  product: "product", peptide: "product", item: "product", sku: "product",
  "product name": "product", "line item": "product", description: "product",
  qty: "quantity", quantity: "quantity", units: "quantity",
  price: "unit_price", "unit price": "unit_price", rate: "unit_price",
  total: "total_line", amount: "total_line", "line total": "total_line", revenue: "total_line",
};

function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (raw.length === 0) return NextResponse.json({ error: "Empty sheet" }, { status: 400 });

  const batch = crypto.randomUUID();
  const skipped: number[] = [];

  // map each row to canonical fields
  type Mapped = Record<string, unknown>;
  const mappedRows: Mapped[] = [];
  raw.forEach((r, i) => {
    const m: Mapped = {};
    for (const [k, v] of Object.entries(r)) {
      const canon = FIELD_MAP[k.trim().toLowerCase()];
      if (canon && m[canon] === undefined && v !== "") m[canon] = v;
    }
    if (!m.product) skipped.push(i + 2);
    else mappedRows.push(m);
  });

  if (mappedRows.length === 0) {
    return NextResponse.json(
      { error: "No usable rows — need a product/peptide/item column", headers: Object.keys(raw[0]) },
      { status: 400 }
    );
  }

  // group rows into orders: by order_number if present, else customer+date, else one order per row
  const groups = new Map<string, Mapped[]>();
  mappedRows.forEach((m, i) => {
    const key = m.order_number
      ? `n:${m.order_number}`
      : m.customer_name || m.order_date
        ? `cd:${m.customer_name ?? ""}|${m.order_date ?? ""}`
        : `row:${i}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  });

  let orders = 0;
  let items = 0;
  for (const rows of groups.values()) {
    const h = rows[0];
    const lineItems: OrderItem[] = rows.map((m) => {
      const quantity = toNum(m.quantity) ?? 1;
      const unit_price = toNum(m.unit_price);
      let total = toNum(m.total_line);
      if (total == null && unit_price != null) total = unit_price * quantity;
      return { product: String(m.product).trim(), quantity, unit_price, total };
    });
    const itemsSum = lineItems.reduce((s, it) => s + (it.total ?? 0), 0);
    await insertOrder(
      {
        order_number: h.order_number ? String(h.order_number) : null,
        order_date: toISODate(h.order_date),
        customer_name: h.customer_name ? String(h.customer_name) : null,
        email: h.email ? String(h.email) : null,
        phone: h.phone ? String(h.phone) : null,
        address: h.address ? String(h.address) : null,
        city: h.city ? String(h.city) : null,
        state: h.state ? String(h.state) : null,
        zip: h.zip ? String(h.zip) : null,
        shipping_cost: toNum(h.shipping_cost),
        subtotal: toNum(h.subtotal) ?? itemsSum,
        total: toNum(h.total) ?? itemsSum + (toNum(h.shipping_cost) ?? 0),
        source: "csv",
        batch_id: batch,
      },
      lineItems
    );
    orders++;
    items += lineItems.length;
  }

  return NextResponse.json({ inserted: items, orders, skippedRows: skipped, batch });
}
