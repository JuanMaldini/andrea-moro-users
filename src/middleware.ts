import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/"];
const ADMIN_PATHS = ["/admin"];

interface PbCookiePayload {
  token?: string;
  record?: { admin?: boolean };
}

function parsePbCookie(rawValue: string): {
  isAuthenticated: boolean;
  isAdmin: boolean;
} {
  try {
    const parsed: PbCookiePayload = JSON.parse(decodeURIComponent(rawValue));
    if (!parsed.token) return { isAuthenticated: false, isAdmin: false };

    // Decodificar JWT (sin verificar firma — solo para leer exp y campos)
    const [, b64] = parsed.token.split(".");
    const padded = b64 + "==".slice(0, (4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));

    const isAuthenticated =
      typeof payload.exp === "number" && payload.exp > Date.now() / 1000;
    const isAdmin = parsed.record?.admin === true;

    return { isAuthenticated, isAdmin };
  } catch {
    return { isAuthenticated: false, isAdmin: false };
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authCookie = request.cookies.get("pb_auth");

  const { isAuthenticated, isAdmin } = authCookie?.value
    ? parsePbCookie(authCookie.value)
    : { isAuthenticated: false, isAdmin: false };

  const isPublicPath = PUBLIC_PATHS.includes(pathname);
  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p));

  // No autenticado intentando acceder a ruta protegida → login
  if (!isAuthenticated && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Autenticado en login → dashboard
  if (isAuthenticated && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Ruta admin sin ser admin → dashboard
  if (isAdminPath && !isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Excluir assets estáticos, imágenes y favicon
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
