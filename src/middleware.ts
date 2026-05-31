import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/"];

interface PbCookiePayload {
  token?: string;
  record?: Record<string, unknown>;
}

/**
 * El middleware solo verifica AUTENTICACIÓN (token válido y no expirado).
 * La verificación de rol admin la hace cada Server Component con una
 * llamada fresca a PocketBase (authRefresh), que es la fuente de verdad.
 * Así evitamos depender de qué campos incluye PocketBase en la cookie.
 */
function isAuthenticated(rawValue: string): boolean {
  try {
    const parsed: PbCookiePayload = JSON.parse(decodeURIComponent(rawValue));
    if (!parsed.token) return false;

    const [, b64] = parsed.token.split(".");
    const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));

    return typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authCookie = request.cookies.get("pb_auth");
  const authenticated = authCookie?.value ? isAuthenticated(authCookie.value) : false;

  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  // No autenticado → login
  if (!authenticated && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Autenticado en login → dashboard
  if (authenticated && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
