import { NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";

export const dynamic = "force-dynamic";

// Env: GA_SERVICE_ACCOUNT_JSON, GA_PROPERTY_GLL, GA_PROPERTY_QUANTIS

interface GARow {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}
interface GAReport {
  rows?: GARow[];
}

const RANGE = [{ startDate: "30daysAgo", endDate: "today" }];

type GAFilter = { filter: { fieldName: string; stringFilter?: { value: string }; inListFilter?: { values: string[] } } };
const hostFilter = (hosts?: string[]): GAFilter | undefined =>
  hosts ? { filter: { fieldName: "hostName", inListFilter: { values: hosts } } } : undefined;
const andFilters = (...fs: (GAFilter | undefined)[]) => {
  const present = fs.filter(Boolean) as GAFilter[];
  if (!present.length) return {};
  return { dimensionFilter: present.length === 1 ? present[0] : { andGroup: { expressions: present } } };
};

async function batchReports(auth: GoogleAuth, property: string, hosts?: string[]) {
  const client = await auth.getClient();
  const res = await client.request<{ reports?: GAReport[] }>({
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${property}:batchRunReports`,
    method: "POST",
    data: {
      requests: [
        // 0: daily sessions/users
        {
          dateRanges: RANGE,
          dimensions: [{ name: "date" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }],
          orderBys: [{ dimension: { dimensionName: "date" } }],
          ...andFilters(hostFilter(hosts)),
        },
        // 1: totals + bounce/engagement
        {
          dateRanges: RANGE,
          ...andFilters(hostFilter(hosts)),
          metrics: [
            { name: "sessions" }, { name: "activeUsers" }, { name: "screenPageViews" },
            { name: "bounceRate" }, { name: "averageSessionDuration" }, { name: "newUsers" },
          ],
        },
        // 2: traffic sources (channel groups)
        {
          dateRanges: RANGE,
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }, { name: "bounceRate" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 8,
          ...andFilters(hostFilter(hosts)),
        },
        // 3: top states (US regions)
        {
          dateRanges: RANGE,
          dimensions: [{ name: "region" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }],
          ...andFilters(
            { filter: { fieldName: "country", stringFilter: { value: "United States" } } },
            hostFilter(hosts)
          ),
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 10,
        },
        // 4: top cities
        {
          dateRanges: RANGE,
          dimensions: [{ name: "city" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 11, // one extra in case of "(not set)"
          ...andFilters(hostFilter(hosts)),
        },
      ],
    },
  });

  const reports = res.data.reports ?? [];
  const rows = (i: number) => reports[i]?.rows ?? [];
  const dim = (r: GARow, i = 0) => r.dimensionValues?.[i]?.value ?? "";
  const met = (r: GARow, i = 0) => Number(r.metricValues?.[i]?.value ?? 0);

  const totalsRow = rows(1)[0];
  return {
    daily: rows(0).map((r) => ({ date: dim(r), sessions: met(r, 0), users: met(r, 1) })),
    totals: totalsRow
      ? {
          sessions: met(totalsRow, 0),
          users: met(totalsRow, 1),
          pageViews: met(totalsRow, 2),
          bounceRate: met(totalsRow, 3),
          avgSessionSec: met(totalsRow, 4),
          newUsers: met(totalsRow, 5),
        }
      : null,
    channels: rows(2).map((r) => ({ channel: dim(r), sessions: met(r, 0), bounceRate: met(r, 1) })),
    states: rows(3)
      .filter((r) => dim(r) && dim(r) !== "(not set)")
      .map((r) => ({ state: dim(r), sessions: met(r, 0), users: met(r, 1) })),
    cities: rows(4)
      .filter((r) => dim(r) && dim(r) !== "(not set)")
      .slice(0, 10)
      .map((r) => ({ city: dim(r), sessions: met(r, 0), users: met(r, 1) })),
  };
}

async function topPages(auth: GoogleAuth, property: string, hosts?: string[]) {
  const client = await auth.getClient();
  const res = await client.request<GAReport>({
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
    method: "POST",
    data: {
      dateRanges: RANGE,
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "sessions" }, { name: "bounceRate" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 10,
      ...andFilters(hostFilter(hosts)),
    },
  });
  return (res.data.rows ?? []).map((r) => ({
    page: r.dimensionValues?.[0]?.value ?? "",
    views: Number(r.metricValues?.[0]?.value ?? 0),
    sessions: Number(r.metricValues?.[1]?.value ?? 0),
    bounceRate: Number(r.metricValues?.[2]?.value ?? 0),
  }));
}

async function siteReport(auth: GoogleAuth, property: string, hosts?: string[]) {
  const [reports, pages] = await Promise.all([batchReports(auth, property, hosts), topPages(auth, property, hosts)]);
  return { ...reports, pages };
}

export async function GET() {
  const props: { key: string; label: string; id?: string; hosts?: string[] }[] = [
    // gll and dose share one GA4 property — split them by hostname
    { key: "gll", label: "goldenlotuslabs.com", id: process.env.GA_PROPERTY_GLL, hosts: ["www.goldenlotuslabs.com", "goldenlotuslabs.com"] },
    { key: "dose", label: "dose.goldenlotuslabs.com", id: process.env.GA_PROPERTY_GLL, hosts: ["dose.goldenlotuslabs.com"] },
    { key: "quantis", label: "quantispeptides.com", id: process.env.GA_PROPERTY_QUANTIS },
  ].filter((p) => p.id);
  const credsJson = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (props.length === 0 || (!credsJson && !process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    return NextResponse.json({ configured: false });
  }
  try {
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
      ...(credsJson ? { credentials: JSON.parse(credsJson) } : {}),
    });
    const results = await Promise.all(props.map((p) => siteReport(auth, p.id!, p.hosts)));
    const sites = props.map((p, i) => ({ key: p.key, label: p.label, ...results[i] }));
    return NextResponse.json({ configured: true, sites });
  } catch (e) {
    return NextResponse.json({ configured: true, error: (e as Error).message }, { status: 502 });
  }
}
