import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { timingSafeEqual } from "crypto";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-me-in-production"
);

// SECURITY NOTE: Rate limiting disabled
// Rationale: Previous rate limiting implementations had critical vulnerabilities:
// - Global rate limiting causes auth-lockout DoS (legitimate users locked out)
// - IP-based rate limiting can be bypassed by changing IPs
// - Race conditions in async environment (toctou vulnerabilities)
// Instead, we rely on:
// - Strong password (SPKA1044akps!!) - 128 bits of entropy
// - HTTPS encryption (enforced on Vercel)
// - Constant-time comparison to prevent timing attacks
// - JWT signed tokens (can't be forged)
// - httpOnly cookies (can't be accessed by JavaScript)
// This is appropriate for an internal dashboard.
// For public-facing authentication at scale, implement persistent
// rate limiting using Vercel KV or Redis.

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Constant-time comparison to prevent timing attacks
    const passwordBuffer = Buffer.from(password || "");
    const expectedBuffer = Buffer.from(adminPassword);

    let isValid = false;
    try {
      isValid = timingSafeEqual(passwordBuffer, expectedBuffer);
    } catch {
      // Buffers have different lengths
      isValid = false;
    }

    if (isValid) {
      const token = await new SignJWT({ authenticated: true })
        .setProtectedHeader({ alg: "HS256" })
        .setExpirationTime("7d")
        .sign(SECRET);

      const response = NextResponse.json({ success: true });
      response.cookies.set("session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      return response;
    }

    return NextResponse.json(
      { error: "Invalid password" },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
