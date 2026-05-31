/**
 * pocketbase.ts — cliente SERVER-SIDE únicamente.
 * Importar solo desde Server Components, Route Handlers o middleware.
 * Para client components usar pocketbase-browser.ts
 */
import PocketBase from "pocketbase";
import { cookies } from "next/headers";

const PB_URL =
  process.env.NEXT_PUBLIC_PB_URL ||
  process.env.VITE_PB_URL ||
  "";

export const COLLECTION_USERS =
  process.env.NEXT_PUBLIC_PB_USERS ||
  process.env.VITE_PB_USERS ||
  "andreamoro_user";

export const COLLECTION_DATA =
  process.env.NEXT_PUBLIC_PB_DATA ||
  process.env.VITE_PB_DATA ||
  "andreamoro_data";

/**
 * Crea un cliente PocketBase autenticado con la cookie de sesión del request.
 * Llamar dentro de Server Components (async).
 */
export async function createServerClient(): Promise<PocketBase> {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  const cookieStore = cookies();
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

export function getPbUrl(): string {
  return PB_URL;
}
