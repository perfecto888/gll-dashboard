import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { timingSafeEqual } from "crypto";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-me-in-production"
);

// Rate limiting: max 5 attempts per 15 minutes
// Note: In production, use a persistent service like Redis or Vercel KV
const loginAttempts = new Map<string, { count: number; resetTime: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL = 60 * 1000; // Clean up every minute
let lastCleanup = Date.now();

function cleanupOldEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  for (const [key, value] of loginAttempts.entries()) {
    if (now > value.resetTime) {
      loginAttempts.delete(key);
    }
  }
  lastCleanup = now;

  // Prevent unbounded growth - limit to 1000 entries
  if (loginAttempts.size > 1000) {
    const entriesToDelete = loginAttempts.size - 500;
    let deleted = 0;
    for (const [key] of loginAttempts.entries()) {
      if (deleted >= entriesToDelete) break;
      loginAttempts.delete(key);
      deleted++;
    }
  }
}

function checkRateLimit(ip: string): boolean {
  cleanupOldEntries();

  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now > record.resetTime) {
    loginAttempts.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_ATTEMPTS) {
    return false;
  }

  record.count++;
  return true;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429 }
    );
  }

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
