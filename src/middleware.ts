import { NextRequest, NextResponse } from "next/server";

interface PbCookiePayload {
  token?: string;
  // PocketBase 0.21 exporta el usuario en la clave `model` (no `record`).
  model?: Record<string, unknown>;
}

interface AuthState {
  authenticated: boolean;
  admin: boolean;
}

function readAuth(rawValue: string): AuthState {
  try {
    const parsed: PbCookiePayload = JSON.parse(decodeURIComponent(rawValue));
    if (!parsed.token) return { authenticated: false, admin: false };

    const [, b64] = parsed.token.split(".");
    const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));

    const valid =
      typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
    const admin = parsed.model?.admin === true;
    return { authenticated: valid, admin: valid && admin };
  } catch {
    return { authenticated: false, admin: false };
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authCookie = request.cookies.get("pb_auth");
  const { admin } = authCookie?.value
    ? readAuth(authCookie.value)
    : { admin: false };

  // /admin (login) es público — si ya eres admin, redirige al panel
  if (pathname === "/admin") {
    if (admin) {
      return NextResponse.redirect(new URL("/admin/cursos", request.url));
    }
    return NextResponse.next();
  }

  // /admin/cursos y subrutas requieren ser ADMIN (no basta con estar logueado)
  if (pathname.startsWith("/admin/")) {
    if (!admin) {
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
