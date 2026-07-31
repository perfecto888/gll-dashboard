import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import { timingSafeEqual } from "crypto";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-me-in-production"
);

// Global rate limiting with exponential backoff
// Tracks failed attempts globally to prevent brute force attacks
let failedAttempts = 0;
let lastFailureTime = 0;
const BASE_DELAY_MS = 1000; // 1 second base delay

function getBackoffDelay(): number {
  const now = Date.now();
  const timeSinceLastFailure = now - lastFailureTime;

  // Reset if more than 1 hour has passed
  if (timeSinceLastFailure > 60 * 60 * 1000) {
    failedAttempts = 0;
    return 0;
  }

  // Exponential backoff: 2^(attempts-1) * base delay, max 5 minutes
  const delay = Math.min(
    Math.pow(2, Math.max(0, failedAttempts - 1)) * BASE_DELAY_MS,
    5 * 60 * 1000
  );

  return Math.max(0, delay - timeSinceLastFailure);
}

function checkRateLimit(): { allowed: boolean; retryAfter?: number } {
  const delay = getBackoffDelay();

  if (delay > 0) {
    return { allowed: false, retryAfter: Math.ceil(delay / 1000) };
  }

  return { allowed: true };
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit();

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Too many login attempts. Try again in ${rateLimit.retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfter) },
      }
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
      // Reset failed attempts on successful login
      failedAttempts = 0;
      lastFailureTime = 0;

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

    // Record failed attempt
    failedAttempts++;
    lastFailureTime = Date.now();

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
