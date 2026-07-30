import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { getDb, ensureSchema } from "@/lib/db";
import { ensureContentSchema } from "@/lib/content";

export const dynamic = "force-dynamic";

const RANGE = [{ startDate: "30daysAgo", endDate: "today" }];

function ga() {
  if (!process.env.GA_SERVICE_ACCOUNT_JSON) return null;
  return new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    credentials: JSON.parse(process.env.GA_SERVICE_ACCOUNT_JSON),
  });
}

const PROPERTY: Record<string, string | undefined> = {
  gll: process.env.GA_PROPERTY_GLL,
  quantis: process.env.GA_PROPERTY_QUANTIS,
};

interface GARow { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }

// GET → { views: { "<site>:<path>": number } } for all published posts (30d)
// GET ?site=&path= → deep dive: totals + daily series + channels for one page
export async function GET(req: NextRequest) {
  await ensureSchema();
  await ensureContentSchema();
  const auth = ga();
  if (!auth) return NextResponse.json({ configured: false });

  const site = req.nextUrl.searchParams.get("site");
  const path = req.nextUrl.searchParams.get("path");
  const client = await auth.getClient();

  if (site && path) {
    const property = PROPERTY[site];
    if (!property) return NextResponse.json({ configured: false });
    const res = await client.request<{ reports?: { rows?: GARow[] }[] }>({
      url: `https://analyticsdata.googleapis.com/v1beta/properties/${property}:batchRunReports`,
      method: "POST",
      data: {
        requests: [
          {
            dateRanges: RANGE,
            metrics: [
              { name: "screenPageViews" }, { name: "sessions" }, { name: "activeUsers" },
              { name: "bounceRate" }, { name: "averageSessionDuration" },
            ],
            dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: path } } },
          },
          {
            dateRanges: RANGE,
            dimensions: [{ name: "date" }],
            metrics: [{ name: "screenPageViews" }],
            dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: path } } },
            orderBys: [{ dimension: { dimensionName: "date" } }],
          },
          {
            dateRanges: RANGE,
            dimensions: [{ name: "sessionDefaultChannelGroup" }],
            metrics: [{ name: "sessions" }],
            dimensionFilter: { filter: { fieldName: "pagePath", stringFilter: { matchType: "BEGINS_WITH", value: path } } },
            orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          },
        ],
      },
    });
    const reports = res.data.reports ?? [];
    const t = reports[0]?.rows?.[0];
    const met = (r: GARow | undefined, i: number) => Number(r?.metricValues?.[i]?.value ?? 0);
    return NextResponse.json({
      configured: true,
      totals: {
        views: met(t, 0), sessions: met(t, 1), users: met(t, 2),
        bounceRate: met(t, 3), avgSessionSec: met(t, 4),
      },
      daily: (reports[1]?.rows ?? []).map((r) => ({
        date: r.dimensionValues?.[0]?.value ?? "", views: met(r, 0),
      })),
      channels: (reports[2]?.rows ?? []).map((r) => ({
        channel: r.dimensionValues?.[0]?.value ?? "", sessions: met(r, 0),
      })),
    });
  }

  // bulk: views per published post
  const posts = await getDb().execute(
    `SELECT site, page_path FROM content_posts WHERE status = 'published' AND page_path IS NOT NULL`
  );
  const bySite: Record<string, string[]> = {};
  for (const r of posts.rows as unknown as { site: string; page_path: string }[]) {
    (bySite[r.site] ??= []).push(r.page_path);
  }
  const views: Record<string, number> = {};
  for (const [s, paths] of Object.entries(bySite)) {
    const property = PROPERTY[s];
    if (!property || paths.length === 0) continue;
    try {
      const res = await client.request<{ rows?: GARow[] }>({
        url: `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
        method: "POST",
        data: {
          dateRanges: RANGE,
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }],
          dimensionFilter: { filter: { fieldName: "pagePath", inListFilter: { values: paths } } },
        },
      });
      for (const r of res.data.rows ?? []) {
        views[`${s}:${r.dimensionValues?.[0]?.value}`] = Number(r.metricValues?.[0]?.value ?? 0);
      }
    } catch { /* property may not be set up */ }
  }
  return NextResponse.json({ configured: true, views });
}
