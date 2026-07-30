import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema, trackingUrl } from "@/lib/db";

export const dynamic = "force-dynamic";

// menu filter: "Quantis" → tagged Quantis; "GLL" → everything else (incl. untagged); "all"/absent → no filter
function menuWhere(menu: string | null): { clause: string; args: string[] } {
  if (menu === "Quantis") return { clause: `po.menu = ?`, args: ["Quantis"] };
  if (menu === "GLL") return { clause: `(po.menu IS NULL OR po.menu != 'Quantis')`, args: [] };
  return { clause: `1=1`, args: [] };
}

// combine menu + optional month ("YYYY-MM") filters into one WHERE clause
function scopeWhere(menu: string | null, month: string | null): { clause: string; args: string[] } {
  const mw = menuWhere(menu);
  if (month) return { clause: `${mw.clause} AND substr(po.order_date,1,7) = ?`, args: [...mw.args, month] };
  return mw;
}

export async function GET(req: NextRequest) {
  await ensureSchema();
  const db = getDb();
  const product = req.nextUrl.searchParams.get("product");
  const menu = req.nextUrl.searchParams.get("menu");
  const month = req.nextUrl.searchParams.get("month"); // "YYYY-MM", optional
  const mw = scopeWhere(menu, month);

  if (product) {
    const buyers = await db.execute({
      sql: `SELECT po.customer_name, po.email, SUM(oi.quantity) AS units,
                   COALESCE(SUM(oi.total),0) AS spend, COUNT(DISTINCT po.id) AS orders
            FROM order_items oi JOIN purchase_orders po ON po.id = oi.order_id
            WHERE oi.product = ? AND ${mw.clause}
            GROUP BY COALESCE(po.email, po.customer_name)
            ORDER BY units DESC LIMIT 25`,
      args: [product, ...mw.args],
    });
    return NextResponse.json({ product, buyers: buyers.rows });
  }

  const [totals, topProducts, topBuyers, revenueByMonth, recent] = await Promise.all([
    db.execute({
      sql: `SELECT (SELECT COUNT(*) FROM purchase_orders po WHERE ${mw.clause}) AS orders,
              COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN purchase_orders po ON po.id = oi.order_id WHERE ${mw.clause}),0) AS units,
              (SELECT COALESCE(SUM(total),0) FROM purchase_orders po WHERE ${mw.clause}) AS revenue,
              (SELECT COUNT(DISTINCT COALESCE(po.email, po.customer_name)) FROM purchase_orders po
                 WHERE po.customer_name IS NOT NULL AND ${mw.clause}) AS customers`,
      args: [...mw.args, ...mw.args, ...mw.args, ...mw.args],
    }),
    db.execute({
      sql: `SELECT oi.product, SUM(oi.quantity) AS units, COALESCE(SUM(oi.total),0) AS revenue,
              COUNT(DISTINCT oi.order_id) AS orders
            FROM order_items oi JOIN purchase_orders po ON po.id = oi.order_id
            WHERE ${mw.clause}
            GROUP BY oi.product ORDER BY units DESC LIMIT 12`,
      args: mw.args,
    }),
    db.execute({
      sql: `SELECT po.customer_name, po.email, COUNT(DISTINCT po.id) AS orders,
              COALESCE(SUM(po.total),0) AS spend,
              MIN(po.order_date) AS first_order, MAX(po.order_date) AS last_order
            FROM purchase_orders po
            WHERE po.customer_name IS NOT NULL AND ${mw.clause}
            GROUP BY COALESCE(po.email, po.customer_name)
            ORDER BY spend DESC LIMIT 25`,
      args: mw.args,
    }),
    // revenue-by-month chart always spans every month (menu-filtered only) so the
    // month selector has full context even while `recent`/totals focus on one month
    db.execute({
      sql: `SELECT substr(po.order_date,1,7) AS month, COALESCE(SUM(po.total),0) AS revenue,
              COUNT(*) AS orders
            FROM purchase_orders po WHERE po.order_date IS NOT NULL AND ${menuWhere(menu).clause}
            GROUP BY month ORDER BY month`,
      args: menuWhere(menu).args,
    }),
    db.execute({
      sql: `SELECT po.order_number, po.order_date, po.customer_name, po.total, po.source, po.menu,
              po.carrier, po.tracking_number,
              GROUP_CONCAT(oi.product, ' · ') AS products, SUM(oi.quantity) AS units
            FROM purchase_orders po LEFT JOIN order_items oi ON oi.order_id = po.id
            WHERE ${mw.clause}
            GROUP BY po.id
            ORDER BY po.order_date DESC NULLS LAST,
                     CAST(substr(po.order_number, 3) AS INTEGER) DESC
            ${month ? "" : "LIMIT 20"}`,
      args: mw.args,
    }),
  ]);

  const recentRows = (recent.rows as unknown as { carrier: string | null; tracking_number: string | null }[]).map((r) => ({
    ...r,
    tracking_url: trackingUrl(r.carrier, r.tracking_number),
  }));

  return NextResponse.json({
    totals: totals.rows[0],
    topProducts: topProducts.rows,
    topBuyers: topBuyers.rows,
    revenueByMonth: revenueByMonth.rows,
    recent: recentRows,
  });
}

// undo a bad upload: /api/orders?batch=<id>, or wipe with ?all=1
export async function DELETE(req: NextRequest) {
  await ensureSchema();
  const db = getDb();
  const batch = req.nextUrl.searchParams.get("batch");
  const all = req.nextUrl.searchParams.get("all");
  if (batch) {
    await db.execute({
      sql: `DELETE FROM order_items WHERE order_id IN (SELECT id FROM purchase_orders WHERE batch_id = ?)`,
      args: [batch],
    });
    const r = await db.execute({ sql: `DELETE FROM purchase_orders WHERE batch_id = ?`, args: [batch] });
    return NextResponse.json({ deleted: r.rowsAffected });
  }
  if (all === "1") {
    await db.execute(`DELETE FROM order_items`);
    const r = await db.execute(`DELETE FROM purchase_orders`);
    return NextResponse.json({ deleted: r.rowsAffected });
  }
  return NextResponse.json({ error: "Pass ?batch=<id> or ?all=1" }, { status: 400 });
}
