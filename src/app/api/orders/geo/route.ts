import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

const ALL_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

function menuWhere(menu: string | null): { clause: string; args: string[] } {
  if (menu === "Quantis") return { clause: `po.menu = ?`, args: ["Quantis"] };
  if (menu === "GLL") return { clause: `(po.menu IS NULL OR po.menu != 'Quantis')`, args: [] };
  return { clause: `1=1`, args: [] };
}

export async function GET(req: NextRequest) {
  await ensureSchema();
  const db = getDb();
  const menu = req.nextUrl.searchParams.get("menu");
  const state = req.nextUrl.searchParams.get("state");
  const mw = menuWhere(menu);

  // drill-down: one state's detail
  if (state) {
    const [byMonth, topClients, orderList] = await Promise.all([
      db.execute({
        sql: `SELECT substr(po.order_date,1,7) AS month, COUNT(*) AS orders, COALESCE(SUM(po.total),0) AS revenue
              FROM purchase_orders po
              WHERE po.state = ? AND po.order_date IS NOT NULL AND ${mw.clause}
              GROUP BY month ORDER BY month`,
        args: [state, ...mw.args],
      }),
      db.execute({
        sql: `SELECT po.customer_name, po.city, COUNT(*) AS orders, COALESCE(SUM(po.total),0) AS spend
              FROM purchase_orders po
              WHERE po.state = ? AND po.customer_name IS NOT NULL AND ${mw.clause}
              GROUP BY COALESCE(po.email, po.customer_name)
              ORDER BY spend DESC LIMIT 5`,
        args: [state, ...mw.args],
      }),
      db.execute({
        sql: `SELECT po.order_number, po.order_date, po.customer_name, po.city, po.address, po.total,
                     GROUP_CONCAT(oi.product, ' · ') AS products
              FROM purchase_orders po LEFT JOIN order_items oi ON oi.order_id = po.id
              WHERE po.state = ? AND ${mw.clause}
              GROUP BY po.id
              ORDER BY po.order_date DESC NULLS LAST LIMIT 50`,
        args: [state, ...mw.args],
      }),
    ]);
    return NextResponse.json({
      state,
      byMonth: byMonth.rows,
      topClients: topClients.rows,
      orders: orderList.rows,
    });
  }

  // overview: per-state totals
  const states = await db.execute({
    sql: `SELECT po.state, COUNT(*) AS orders, COALESCE(SUM(po.total),0) AS revenue
          FROM purchase_orders po
          WHERE po.state IS NOT NULL AND length(po.state) = 2 AND ${mw.clause}
          GROUP BY po.state`,
    args: mw.args,
  });
  const covered = new Set((states.rows as unknown as { state: string }[]).map((r) => r.state));
  const coveredList = [...covered].sort().map((code) => ({ code, name: ALL_STATES[code] ?? code }));
  const uncoveredList = Object.entries(ALL_STATES)
    .filter(([code]) => !covered.has(code))
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    states: states.rows,
    coverage: {
      totalStates: 50,
      coveredCount: coveredList.length,
      uncoveredCount: uncoveredList.length,
      covered: coveredList,
      uncovered: uncoveredList,
    },
  });
}
