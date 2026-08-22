import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const gdriveid = "1y9HMQ1FJ47Or-uvcmDANQ4Rc6SRS4ErY";
    const videoUrl = `https://drive.google.com/uc?id=${gdriveid}`;

    const response = await fetch(videoUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "video/mp4,video/*",
      },
    });

    if (!response.ok) {
      console.error("Google Drive response:", response.status, response.statusText);
      return NextResponse.json({ error: `Google Drive error: ${response.statusText}` }, { status: response.status });
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: "Empty response from Google Drive" }, { status: 500 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "public, max-age=86400",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Video proxy error:", error);
    return NextResponse.json({ error: `Server error: ${error}` }, { status: 500 });
  }
}
