import { NextResponse } from "next/server";
import { closeConfigured, getPipelineData } from "@/lib/close";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!closeConfigured()) {
    return NextResponse.json({ configured: false });
  }
  try {
    const data = await getPipelineData();
    return NextResponse.json({ configured: true, ...data });
  } catch (e) {
    return NextResponse.json(
      { configured: true, error: (e as Error).message },
      { status: 502 }
    );
  }
}
