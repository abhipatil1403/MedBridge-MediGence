import { NextRequest, NextResponse } from "next/server";
import { InvalidDiscoveryFilters, parseDiscoveryFilters } from "@/lib/discovery/filters";
import { searchService } from "@/lib/discovery/search-service";

export async function GET(request: NextRequest) {
  try {
    const filters = parseDiscoveryFilters(request.nextUrl.searchParams);
    const results = await searchService.search(filters);
    return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof InvalidDiscoveryFilters)) console.error("Discovery catalog read failed", error);
    const message = error instanceof InvalidDiscoveryFilters ? error.message : "Search is temporarily unavailable. Please retry.";
    return NextResponse.json({ error: message }, { status: error instanceof InvalidDiscoveryFilters ? 400 : 503 });
  }
}
