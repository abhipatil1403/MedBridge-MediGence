import { NextRequest, NextResponse } from "next/server";
import { portalForHost } from "@/lib/portals/hosts";
export function proxy(request: NextRequest) {
  const portal = portalForHost(
    request.nextUrl.hostname,
    process.env.MEDBRIDGE_PORTAL_HOSTS,
  );
  if (!portal || request.nextUrl.pathname === `/${portal}` || request.nextUrl.pathname.startsWith(`/${portal}/`))
    return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/${portal}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}
export const config = {
  matcher: ["/((?!api/|auth/|_next/|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
