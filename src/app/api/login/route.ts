import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "change-me-in-production"
);

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (password === process.env.ADMIN_PASSWORD) {
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
    });
    return response;
  }

  return NextResponse.json({ error: "Invalid password" }, { status: 401 });
}
