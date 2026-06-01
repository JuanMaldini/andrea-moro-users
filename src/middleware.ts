import { NextRequest, NextResponse } from "next/server";

interface PbCookiePayload {
  token?: string;
}

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
  const authenticated = authCookie?.value
    ? isAuthenticated(authCookie.value)
    : false;

  // /admin (login) es público — si ya estás autenticado, redirige al panel
  if (pathname === "/admin") {
    if (authenticated) {
      return NextResponse.redirect(new URL("/admin/cursos", request.url));
    }
    return NextResponse.next();
  }

  // /admin/cursos y subrutas requieren sesión válida
  if (pathname.startsWith("/admin/")) {
    if (!authenticated) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  // Todo lo demás (páginas de curso, /) es público
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
