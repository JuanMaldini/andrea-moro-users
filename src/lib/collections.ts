/**
 * collections.ts — nombres de colecciones y URLs de archivos.
 * Sin dependencias de server/cliente: se importa desde ambos lados.
 */

export const PB_URL = (process.env.NEXT_PUBLIC_PB_URL ?? "").replace(/\/$/, "");

export const COLLECTION_USERS =
  process.env.NEXT_PUBLIC_PB_USERS ?? "andreamoro_user";
export const COLLECTION_COURSES =
  process.env.NEXT_PUBLIC_PB_COURSES ?? "andreamoro_courses";
export const COLLECTION_VIDEOS =
  process.env.NEXT_PUBLIC_PB_VIDEOS ?? "andreamoro_videos";
export const COLLECTION_MEDIA =
  process.env.NEXT_PUBLIC_PB_MEDIA ?? "andreamoro_media";

/** URL pública de un archivo (los archivos no están protegidos). */
export function pbFileUrl(collection: string, recordId: string, filename: string): string {
  return `${PB_URL}/api/files/${collection}/${recordId}/${filename}`;
}
