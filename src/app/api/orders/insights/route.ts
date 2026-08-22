import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

function menuWhere(menu: string | null): { clause: string; args: string[] } {
  if (menu === "Quantis") return { clause: `po.menu = ?`, args: ["Quantis"] };
  if (menu === "GLL") return { clause: `(po.menu IS NULL OR po.menu != 'Quantis')`, args: [] };
  return { clause: `1=1`, args: [] };
}

export async function GET(req: NextRequest) {
  await ensureSchema();
  const db = getDb();
  const mw = menuWhere(req.nextUrl.searchParams.get("menu"));

  const [affiliates, unpaid, atRisk, repeat] = await Promise.all([
    db.execute({
      sql: `SELECT po.affiliate, COUNT(*) AS orders, COALESCE(SUM(po.total),0) AS revenue,
                   COALESCE(SUM(po.commission),0) AS commission,
                   COALESCE(SUM(CASE WHEN po.paid = 'N' THEN po.commission END),0) AS commission_unpaid,
                   MAX(po.order_date) AS last_order
            FROM purchase_orders po
            WHERE po.affiliate IS NOT NULL AND ${mw.clause}
            GROUP BY po.affiliate ORDER BY revenue DESC`,
      args: mw.args,
    }),
    db.execute({
      sql: `SELECT po.order_number, po.order_date, po.customer_name, po.affiliate, po.total, po.commission
            FROM purchase_orders po
            WHERE po.paid = 'N' AND ${mw.clause}
            ORDER BY po.total DESC LIMIT 30`,
      args: mw.args,
    }),
    // high-LTV customers gone quiet: 45+ days since last order, ranked by lifetime spend
    db.execute({
      sql: `SELECT po.customer_name, po.email, COUNT(*) AS orders,
                   COALESCE(SUM(po.total),0) AS ltv, MAX(po.order_date) AS last_order,
                   CAST(julianday('now') - julianday(MAX(po.order_date)) AS INTEGER) AS days_quiet
            FROM purchase_orders po
            WHERE po.customer_name IS NOT NULL AND po.order_date IS NOT NULL AND ${mw.clause}
            GROUP BY COALESCE(po.email, po.customer_name)
            HAVING days_quiet >= 45 AND ltv >= 500
            ORDER BY ltv DESC LIMIT 15`,
      args: mw.args,
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS customers,
                   SUM(CASE WHEN cnt >= 2 THEN 1 ELSE 0 END) AS repeaters
            FROM (SELECT COUNT(*) AS cnt FROM purchase_orders po
                  WHERE po.customer_name IS NOT NULL AND ${mw.clause}
                  GROUP BY COALESCE(po.email, po.customer_name))`,
      args: mw.args,
    }),
  ]);

  const rep = repeat.rows[0] as unknown as { customers: number; repeaters: number };
  return NextResponse.json({
    affiliates: affiliates.rows,
    unpaid: unpaid.rows,
    unpaidTotal: (unpaid.rows as unknown as { total: number | null }[]).reduce((s, r) => s + (r.total ?? 0), 0),
    atRisk: atRisk.rows,
    repeatRate: rep && Number(rep.customers) > 0 ? Number(rep.repeaters) / Number(rep.customers) : null,
    customers: rep ? Number(rep.customers) : 0,
  });
}
