/**
 * pocketbase-browser.ts — singleton cliente para Client Components.
 * Sincroniza el authStore con una cookie (pb_auth) para que el middleware
 * y los Server Components puedan leer la sesión.
 */
"use client";

import PocketBase from "pocketbase";

const PB_URL =
  process.env.NEXT_PUBLIC_PB_URL ||
  process.env.VITE_PB_URL ||
  "";

let pb: PocketBase | null = null;

export function getPocketBase(): PocketBase {
  if (pb) return pb;

  pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  // Cada vez que cambia el authStore (login / logout / refresh)
  // exportamos la cookie para que el middleware la pueda leer en SSR.
  pb.authStore.onChange(() => {
    if (typeof document !== "undefined") {
      document.cookie = pb!.authStore.exportToCookie({
        httpOnly: false,     // necesario para que JS pueda escribirla
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        path: "/",
      });
    }
  });

  return pb;
}

export const COLLECTION_USERS =
  process.env.NEXT_PUBLIC_PB_USERS || "andreamoro_user";

export const COLLECTION_DATA =
  process.env.NEXT_PUBLIC_PB_DATA || "andreamoro_data";
