/**
 * pocketbase.ts — cliente SERVER-SIDE únicamente.
 * Importar solo desde Server Components, Route Handlers o middleware.
 * Para client components usar pocketbase-browser.ts
 *
 * Sin token de superusuario: las páginas públicas leen como anónimo (las API
 * rules permiten leer lo publicado) y el panel admin lee con la sesión del
 * usuario admin (cookie pb_auth).
 */
import PocketBase from "pocketbase";
import { cookies } from "next/headers";
import { PB_URL, COLLECTION_USERS } from "./collections";

export {
  COLLECTION_USERS,
  COLLECTION_COURSES,
  COLLECTION_VIDEOS,
  COLLECTION_MEDIA,
} from "./collections";

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
    // Valida la sesión contra PocketBase (no basta con que el JWT no haya
    // vencido): si el usuario ya no existe o el token fue invalidado → anónimo.
    if (pb.authStore.isValid) {
      try {
        await pb.collection(COLLECTION_USERS).authRefresh();
      } catch (err) {
        const status = (err as { status?: number })?.status ?? 0;
        // 401/403/404 = sesión inválida. Otros (red caída) no desloguean.
        if (status >= 400 && status < 500) pb.authStore.clear();
      }
    }
  }

  return pb;
}

/** Cliente anónimo para páginas públicas (solo ve lo que permiten las API rules). */
export function createPublicClient(): PocketBase {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  return pb;
}

export function getPbUrl(): string {
  return PB_URL;
}
