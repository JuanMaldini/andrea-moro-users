/**
 * pocketbase.ts — cliente SERVER-SIDE únicamente.
 * Importar solo desde Server Components, Route Handlers o middleware.
 * Para client components usar pocketbase-browser.ts
 */
import PocketBase from "pocketbase";
import { cookies } from "next/headers";

const PB_URL = process.env.NEXT_PUBLIC_PB_URL ?? "";

export const COLLECTION_USERS =
  process.env.NEXT_PUBLIC_PB_USERS ?? "andreamoro_user";

export const COLLECTION_DATA =
  process.env.NEXT_PUBLIC_PB_DATA ?? "andreamoro_data";

/**
 * Crea un cliente PocketBase autenticado con la cookie de sesión del request.
 * Llamar dentro de Server Components (async).
 */
export async function createServerClient(): Promise<PocketBase> {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  const cookieStore = await cookies(); // Next.js 15: cookies() es async
  const authCookie = cookieStore.get("pb_auth");

  if (authCookie?.value) {
    pb.authStore.loadFromCookie(
      `pb_auth=${decodeURIComponent(authCookie.value)}`
    );
    // Intentar refrescar el token si va a expirar pronto
    try {
      if (pb.authStore.isValid) {
        await pb
          .collection(COLLECTION_USERS)
          .authRefresh()
          .catch(() => {
            // Si falla el refresh el token simplemente queda como está
          });
      }
    } catch (_) {}
  }

  return pb;
}

/**
 * Cliente con token de superusuario de PocketBase.
 * Bypasea emailVisibility y API Rules — usar solo en Server Components
 * para operaciones de administración (ej: listar todos los usuarios con email).
 * NUNCA exponer este cliente ni su token al navegador.
 */
export function createAdminClient(): PocketBase {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  const superToken = process.env.PB_ADMIN_TOKEN ?? "";

  if (superToken) {
    pb.authStore.save(superToken, null);
  }

  return pb;
}

export function getPbUrl(): string {
  return PB_URL;
}
