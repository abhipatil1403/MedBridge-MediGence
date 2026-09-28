import { NextRequest, NextResponse } from "next/server";
import { searchService } from "@/lib/discovery/search-service";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? "";
    if (q.length > 80) return NextResponse.json({ error: "Query is too long." }, { status: 400 });
    return NextResponse.json({ suggestions: await searchService.suggestions(q) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Suggestions are unavailable." }, { status: 503 });
  }
}
