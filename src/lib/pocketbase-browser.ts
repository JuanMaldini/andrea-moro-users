/**
 * pocketbase-browser.ts — singleton cliente para Client Components.
 * Sincroniza el authStore con una cookie (pb_auth) para que el middleware
 * y los Server Components puedan leer la sesión.
 */
"use client";

import PocketBase from "pocketbase";
import { PB_URL } from "./collections";

export {
  COLLECTION_USERS,
  COLLECTION_COURSES,
  COLLECTION_VIDEOS,
  COLLECTION_MEDIA,
  pbFileUrl,
} from "./collections";

let pb: PocketBase | null = null;

export function getPocketBase(): PocketBase {
  if (pb) return pb;

  pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  // Al crear la instancia, cargamos el token desde la cookie existente
  // para que las navegaciones directas (refresh de página) estén autenticadas.
  if (typeof document !== "undefined") {
    pb.authStore.loadFromCookie(document.cookie);
  }

  // Cada vez que cambia el authStore (login / logout / refresh)
  // exportamos la cookie para que el middleware la pueda leer en SSR.
  pb.authStore.onChange(() => {
    if (typeof document !== "undefined") {
      document.cookie = pb!.authStore.exportToCookie({
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        path: "/",
      });
    }
  });

  return pb;
}
