import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { insertOrder } from "@/lib/db";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LineItem = z.object({
  product: z.string().describe("Full item name as shown, e.g. 'Wolverine Blend - BPC-157 (10mg)/TB500 (10mg)'"),
  quantity: z.number(),
  unit_price: z.union([z.number(), z.null()]),
  total: z.union([z.number(), z.null()]),
});

const OrderExtraction = z.object({
  order_number: z.union([z.string(), z.null()]).describe("Order number, e.g. 'GL1228'"),
  order_date: z.union([z.string(), z.null()]).describe("ISO date YYYY-MM-DD if visible, else null"),
  customer_name: z.union([z.string(), z.null()]).describe("Recipient / customer name"),
  email: z.union([z.string(), z.null()]),
  phone: z.union([z.string(), z.null()]),
  address: z.union([z.string(), z.null()]).describe("Street address line"),
  city: z.union([z.string(), z.null()]),
  state: z.union([z.string(), z.null()]).describe("Two-letter state code if US"),
  zip: z.union([z.string(), z.null()]),
  shipping_cost: z.union([z.number(), z.null()]),
  subtotal: z.union([z.number(), z.null()]),
  total: z.union([z.number(), z.null()]).describe("Total due including shipping"),
  items: z.array(LineItem),
});

const MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!MEDIA_TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported image type: ${file.type}` }, { status: 400 });
  }

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: file.type as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
              data,
            },
          },
          {
            type: "text",
            text: "This is a screenshot of a Golden Lotus Labs peptide order confirmation. Extract the order number, recipient name, street address, city, state, zip, phone, email, shipping cost, subtotal, total due, and every line item (item name exactly as written, quantity, unit price, line total). Use null for anything not visible.",
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(OrderExtraction) },
  });

  const parsed = response.parsed_output;
  if (!parsed || parsed.items.length === 0) {
    return NextResponse.json({ error: "No line items found in image" }, { status: 422 });
  }

  const batch = crypto.randomUUID();
  const orderId = await insertOrder(
    {
      order_number: parsed.order_number,
      order_date: parsed.order_date,
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

  return NextResponse.json({ inserted: parsed.items.length, orderId, batch, extracted: parsed });
}
