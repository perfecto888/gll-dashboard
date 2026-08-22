import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getDb, ensureSchema, insertOrder, setTracking, OrderItem } from "@/lib/db";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

interface Parsed {
  order_number: string;
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
  items: OrderItem[];
}

// fixed-template parser (same as /api/orders/email)
function parseTemplate(text: string): Parsed | null {
  try {
    const t = text.replace(/\r/g, "");
    const order_number = t.match(/Order #(GL\d+)/i)?.[1]?.toUpperCase() ?? null;
    const recipMatch = t.match(/\*?Recipient:\*?\s*(.+)\n([\s\S]*?)\n\*?Phone:/);
    if (!order_number || !recipMatch) return null;
    const addrLines = recipMatch[2].split("\n").map((l) => l.trim()).filter(Boolean);
    const last = addrLines[addrLines.length - 1] ?? "";
    const cityMatch = last.match(/^(.*?)\s*,\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    const itemsBlock = t.match(/Item\s+Qty\s+Price\s+Total\n([\s\S]*?)\nSubtotal/);
    if (!itemsBlock) return null;
    const items: OrderItem[] = [];
    for (const line of itemsBlock[1].split("\n")) {
      const m = line.trim().match(/^(.+?)\s+(\d+)\s+\$([\d,.]+)\s+\$([\d,.]+)$/);
      if (m) items.push({ product: m[1].trim(), quantity: Number(m[2]), unit_price: num(m[3]), total: num(m[4]) });
    }
    if (items.length === 0) return null;
    return {
      order_number,
      customer_name: recipMatch[1].trim(),
      email: t.match(/Email:\*?\s*([^\s*]+@[^\s*]+)/)?.[1] ?? null,
      phone: t.match(/\*?Phone:\*?\s*([^*\n]+?)\s*\*?Email:/)?.[1]?.trim() ?? null,
      address: (cityMatch ? addrLines.slice(0, -1) : addrLines).join(", ") || null,
      city: cityMatch?.[1]?.trim() ?? null,
      state: cityMatch?.[2]?.toUpperCase() ?? null,
      zip: cityMatch?.[3] ?? null,
      shipping_cost: num(t.match(/\*?Shipping:\*?[^$\n]*\$([\d,.]+)/)?.[1]),
      subtotal: num(t.match(/Subtotal\*?\$?([\d,.]+)/)?.[1]),
      total: num(t.match(/Total Due\*?\*?\$?([\d,.]+)/)?.[1]),
      items,
    };
  } catch {
    return null;
  }
}

// GET /api/sync — sweep recent order emails into the DB. Auth: Vercel cron
// (Authorization: Bearer CRON_SECRET, checked in middleware) or logged-in cookie.
export async function GET(req: Request) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: "Gmail credentials not configured" }, { status: 500 });
  }
  await ensureSchema();
  const db = getDb();
  const sinceParam = new URL(req.url).searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 14 * 86400_000);
  const stats = { scanned: 0, imported: 0, skipped: 0, unparsed: [] as string[], tracking_updated: 0 };
  const batch = crypto.randomUUID();

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock("[Gmail]/All Mail");
  try {
    const uids = await client.search({
      from: "customerservice@amazinglywellrx.com",
      subject: "received",
      since,
    });
    for (const uid of uids as number[]) {
      const msg = await client.fetchOne(uid, { source: true });
      if (!msg || !msg.source) continue;
      const mail = await simpleParser(msg.source);
      if (!/^Golden Lotus Labs Order #GL\d+ received/i.test(mail.subject ?? "")) continue;
      stats.scanned++;
      const parsed = parseTemplate(mail.text || "");
      if (!parsed) {
        stats.unparsed.push(mail.subject ?? "?");
        continue;
      }
      const excluded = await db.execute({
        sql: `SELECT 1 FROM excluded_orders WHERE order_number = ?`,
        args: [parsed.order_number],
      });
      if (excluded.rows.length > 0) {
        stats.skipped++;
        continue;
      }
      const existing = await db.execute({
        sql: `SELECT po.id, po.order_date, COUNT(oi.id) AS items
              FROM purchase_orders po LEFT JOIN order_items oi ON oi.order_id = po.id
              WHERE po.order_number = ? GROUP BY po.id`,
        args: [parsed.order_number],
      });
      const row = existing.rows[0] as unknown as { order_date: string | null; items: number } | undefined;
      if (row && Number(row.items) > 0) {
        stats.skipped++;
        continue;
      }
      const order_date =
        row?.order_date ?? (mail.date ? mail.date.toISOString().slice(0, 10) : null);
      await insertOrder(
        {
          order_number: parsed.order_number,
          order_date,
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
        parsed.items
      );
      stats.imported++;
    }

    // sweep "your order has shipped" emails for carrier + tracking number
    const shipUids = await client.search({
      from: "customerservice@amazinglywellrx.com",
      subject: "shipped",
      since,
    });
    for (const uid of shipUids as number[]) {
      const msg = await client.fetchOne(uid, { source: true });
      if (!msg || !msg.source) continue;
      const mail = await simpleParser(msg.source);
      if (!/has shipped/i.test(mail.subject ?? "")) continue;
      const t = (mail.text || "").replace(/\r/g, "");
      const orderNum = t.match(/Order:?\*?\s*#(GL\d+)/i)?.[1]?.toUpperCase();
      const carrier = t.match(/Carrier:\*?\s*([A-Za-z]+)/)?.[1] ?? null;
      const tracking = t.match(/Tracking:\*?\s*([A-Za-z0-9]+)/)?.[1] ?? null;
      if (!orderNum || !tracking) continue;
      const updated = await setTracking(orderNum, carrier, tracking);
      if (updated) stats.tracking_updated++;
    }
  } finally {
    lock.release();
    await client.logout();
  }

  return NextResponse.json(stats);
}
