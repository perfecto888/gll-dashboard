import { NextRequest, NextResponse } from "next/server";

async function expectedToken(): Promise<string> {
  const data = new TextEncoder().encode(`gll-dash:${process.env.ADMIN_PASSWORD}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // cron endpoints authenticate with the cron secret
  if (pathname === "/api/sync" || pathname === "/api/tweets/daily") {
    const auth = req.headers.get("authorization");
    if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.next();
    }
    // fall through to cookie check (lets a logged-in browser trigger it too)
  }

  // Calendly webhook: no cookie available, authenticate via secret query param
  if (pathname === "/api/hr/calendly-webhook") {
    const secret = req.nextUrl.searchParams.get("secret");
    if (process.env.CALENDLY_WEBHOOK_SECRET && secret === process.env.CALENDLY_WEBHOOK_SECRET) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ADMIN_PASSWORD) return NextResponse.next(); // local dev without password

  const cookie = req.cookies.get("gll_auth")?.value;
  if (cookie === (await expectedToken())) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|apply|api/login|api/content/public|_next|favicon.ico|video-poster.jpg|peptide-poster.jpg).*)"],
};
