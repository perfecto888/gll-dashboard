import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { insertOrder, getDb, ensureSchema } from "@/lib/db";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LineItem = z.object({
  product: z.string(),
  quantity: z.number(),
  unit_price: z.union([z.number(), z.null()]),
  total: z.union([z.number(), z.null()]),
});

const OrderExtraction = z.object({
  order_number: z.union([z.string(), z.null()]).describe("Order number, e.g. 'GL1228'"),
  customer_name: z.union([z.string(), z.null()]),
  email: z.union([z.string(), z.null()]),
  phone: z.union([z.string(), z.null()]),
  address: z.union([z.string(), z.null()]).describe("Street address line"),
  city: z.union([z.string(), z.null()]),
  state: z.union([z.string(), z.null()]),
  zip: z.union([z.string(), z.null()]),
  shipping_cost: z.union([z.number(), z.null()]),
  subtotal: z.union([z.number(), z.null()]),
  total: z.union([z.number(), z.null()]),
  items: z.array(LineItem),
});

type Extraction = z.infer<typeof OrderExtraction>;

// Fast path: the order email is a fixed template — parse it deterministically.
// Returns null if the text doesn't match, in which case we fall back to Claude.
function parseTemplate(text: string): Extraction | null {
  try {
    const t = text.replace(/\r/g, "");
    const order_number = t.match(/Order #(GL\d+)/i)?.[1]?.toUpperCase() ?? null;
    const recipMatch = t.match(/\*?Recipient:\*?\s*(.+)\n([\s\S]*?)\n\*?Phone:/);
    if (!order_number || !recipMatch) return null;
    const customer_name = recipMatch[1].trim();
    const addrLines = recipMatch[2].split("\n").map((l) => l.trim()).filter(Boolean);
    const last = addrLines[addrLines.length - 1] ?? "";
    const cityMatch = last.match(/^(.*?)\s*,\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    const address = (cityMatch ? addrLines.slice(0, -1) : addrLines).join(", ") || null;
    const phone = t.match(/\*?Phone:\*?\s*([^*\n]+?)\s*\*?Email:/)?.[1]?.trim() ?? null;
    const email = t.match(/Email:\*?\s*([^\s*]+@[^\s*]+)/)?.[1] ?? null;
    const shipping_cost = num(t.match(/\*?Shipping:\*?[^$\n]*\$([\d,.]+)/)?.[1]);
    const subtotal = num(t.match(/Subtotal\*?\$?([\d,.]+)/)?.[1]);
    const total = num(t.match(/Total Due\*?\*?\$?([\d,.]+)/)?.[1]);

    // items live between the "Item Qty Price Total" header and "Subtotal"
    const itemsBlock = t.match(/Item\s+Qty\s+Price\s+Total\n([\s\S]*?)\nSubtotal/);
    if (!itemsBlock) return null;
    const items: Extraction["items"] = [];
    for (const line of itemsBlock[1].split("\n")) {
      const m = line.trim().match(/^(.+?)\s+(\d+)\s+\$([\d,.]+)\s+\$([\d,.]+)$/);
      if (m) {
        items.push({
          product: m[1].trim(),
          quantity: Number(m[2]),
          unit_price: num(m[3]),
          total: num(m[4]),
        });
      }
    }
    if (items.length === 0) return null;
    return {
      order_number, customer_name, email, phone,
      address,
      city: cityMatch?.[1]?.trim() ?? null,
      state: cityMatch?.[2]?.toUpperCase() ?? null,
      zip: cityMatch?.[3] ?? null,
      shipping_cost, subtotal, total, items,
    };
  } catch {
    return null;
  }
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// POST { text: string, email_date?: "YYYY-MM-DD", message_id?: string }
export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.text) return NextResponse.json({ error: "Pass { text }" }, { status: 400 });

  // skip already-imported orders early if the order # is visible in the raw text
  // skip only if the order already has line items — an Excel-imported header-only
  // record gets replaced (enriched) by the email version
  const numMatch = String(body.text).match(/Order #(GL\d+)/i);
  let excelDate: string | null = null;
  if (numMatch) {
    await ensureSchema();
    const res = await getDb().execute({
      sql: `SELECT po.id, po.order_date, COUNT(oi.id) AS items
            FROM purchase_orders po LEFT JOIN order_items oi ON oi.order_id = po.id
            WHERE po.order_number = ? GROUP BY po.id`,
      args: [numMatch[1]],
    });
    const existing = res.rows[0] as unknown as { id: number; order_date: string | null; items: number } | undefined;
    if (existing && Number(existing.items) > 0 && !body.force) {
      return NextResponse.json({ skipped: true, order_number: numMatch[1] });
    }
    excelDate = existing?.order_date ?? null;
  }

  let parsed: Extraction | null = parseTemplate(String(body.text));
  let method = "template";
  if (!parsed) {
    method = "claude";
    const client = new Anthropic();
    const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `This is the text of a Golden Lotus Labs order confirmation email. Extract the order number, recipient name, street address, city, state, zip, phone, email, shipping cost, subtotal, total due, and every line item (item name, quantity, unit price, line total). Use null for anything not present.\n\n---\n${body.text}`,
      },
    ],
      output_config: { format: zodOutputFormat(OrderExtraction) },
    });
    parsed = response.parsed_output;
  }

  if (!parsed || parsed.items.length === 0) {
    return NextResponse.json({ error: "No line items found in email" }, { status: 422 });
  }

  const batch = body.batch_id ?? crypto.randomUUID();
  const orderId = await insertOrder(
    {
      order_number: parsed.order_number,
      order_date: body.email_date ?? excelDate,
      customer_name: parsed.customer_name,
      email: parsed.email,
      phone: parsed.phone,
      address: parsed.address,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      shipping_cost: parsed.shipping_cost,
      subtotal: parsed.subtotal,
      total: parsed.total,
      source: "screenshot",
      batch_id: batch,
    },
    parsed.items.map((it) => ({
      product: it.product.trim(),
      quantity: it.quantity || 1,
      unit_price: it.unit_price,
      total: it.total ?? (it.unit_price != null ? it.unit_price * (it.quantity || 1) : null),
    }))
  );

  return NextResponse.json({ inserted: parsed.items.length, orderId, batch, method, extracted: parsed });
}
